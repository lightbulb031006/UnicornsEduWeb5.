"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  StaffPaymentPreview,
  StaffTrialTeachingWarning,
} from "@/dtos/staff.dto";
import { dismissStaffTrialTeachingWarning } from "@/lib/apis/staff.api";
import {
  buildAdminLikePath,
  type AdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { cn } from "@/lib/utils";

type Props = {
  staffId: string;
  warnings: StaffTrialTeachingWarning[];
  /** Admin / Kế toán chi; Kế toán chi xem hồ sơ của chính mình → `false` (#265). */
  canDismiss: boolean;
  routeBase: AdminLikeRouteBase;
  className?: string;
};

function errorMessage(error: unknown): string {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  if (Array.isArray(message) && message.length > 0) return message.join(", ");
  if (typeof message === "string" && message.trim()) return message;
  return "Không bỏ qua được cảnh báo.";
}

/**
 * Cảnh báo chưa dạy thử trong popup thanh toán: mỗi lớp một dòng, bỏ qua riêng từng lớp.
 * Chỉ cảnh báo, không chặn thanh toán. Đã bỏ qua thì cặp (gia sư, lớp) không nhắc lại.
 */
export default function TrialTeachingPaymentWarning({
  staffId,
  warnings,
  canDismiss,
  routeBase,
  className,
}: Props) {
  const queryClient = useQueryClient();

  const dismissMutation = useMutation({
    mutationFn: (warning: StaffTrialTeachingWarning) =>
      dismissStaffTrialTeachingWarning(staffId, warning.classId),
    onSuccess: (_result, warning) => {
      // Gỡ dòng tại chỗ, không tải lại cả popup (giữ các khoản đang chọn).
      queryClient.setQueriesData<StaffPaymentPreview>(
        { queryKey: ["staff", "payment-preview", staffId] },
        (previous) =>
          previous
            ? {
                ...previous,
                trialTeachingWarnings: previous.trialTeachingWarnings.filter(
                  (item) => item.classId !== warning.classId,
                ),
              }
            : previous,
      );
      toast.success(`Đã bỏ qua cảnh báo lớp ${warning.className}.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (warnings.length === 0) return null;

  const pendingClassId = dismissMutation.isPending
    ? dismissMutation.variables?.classId
    : undefined;

  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-text-primary",
        className,
      )}
    >
      <p className="font-semibold">⚠️ Gia sư chưa có buổi dạy thử</p>
      <p className="mt-0.5 text-xs text-text-secondary">
        Kiểm tra lại trước khi trả (vd gia sư dạy thay vài buổi rồi nghỉ). Chỉ
        là cảnh báo, không chặn thanh toán.
      </p>
      <ul className="mt-2 divide-y divide-warning/20">
        {warnings.map((warning) => (
          <li
            key={warning.classId}
            className="flex min-h-10 items-center justify-between gap-3 py-1.5"
          >
            <Link
              href={buildAdminLikePath(routeBase, `classes/${warning.classId}`)}
              className="min-w-0 truncate text-sm font-medium text-text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {warning.className}
            </Link>
            {canDismiss ? (
              <button
                type="button"
                onClick={() => dismissMutation.mutate(warning)}
                disabled={dismissMutation.isPending}
                className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-border-default bg-bg-surface px-3 text-xs font-medium text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingClassId === warning.classId
                  ? "Đang bỏ qua…"
                  : "Đã kiểm tra, bỏ qua"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!canDismiss ? (
        <p className="mt-1.5 text-xs text-text-muted">
          Cảnh báo của chính bạn — chỉ Admin bỏ qua được.
        </p>
      ) : null}
    </div>
  );
}
