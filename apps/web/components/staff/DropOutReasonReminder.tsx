"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CustomerCareMissingDropOutReason } from "@/dtos/customer-care.dto";
import { STUDENT_DROP_OUT_REASON_MAX_LENGTH } from "@/dtos/student.dto";
import * as authApi from "@/lib/apis/auth.api";
import * as customerCareApi from "@/lib/apis/customer-care.api";
import * as studentApi from "@/lib/apis/student.api";
import { DROP_OUT_REASON_REMINDER_DISMISS_KEY } from "@/lib/login-scoped-dismissals";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { validateBackfilledDropOutReason } from "@/lib/student-drop-out-reason";

const MISSING_REASONS_QUERY_KEY = ["customer-care", "me", "missing-drop-out-reasons"] as const;

/** Giá trị chỉ đọc một lần lúc mount nên không cần subscribe thật. */
const subscribeNoop = () => () => {};

function formatIsoDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return year && month ? `${Number(month)}/${year}` : monthKey;
}

function DropOutReasonReminderRow({ item }: { item: CustomerCareMissingDropOutReason }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const saveMutation = useMutation({
    mutationFn: (dropOutReason: string) =>
      studentApi.updateStudentById(item.studentId, { drop_out_reason: dropOutReason }),
    onSuccess: async () => {
      toast.success("Đã lưu lý do nghỉ.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MISSING_REASONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["student", "detail", item.studentId] }),
      ]);
    },
    onError: (error) => {
      toast.error(getMutationErrorMessage(error, "Không thể lưu lý do nghỉ."));
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateBackfilledDropOutReason(reason);
    if (error) {
      toast.error(error);
      return;
    }
    saveMutation.mutate(reason.trim());
  };

  const inputId = `drop-out-reason-${item.studentId}`;

  return (
    <li className="rounded-lg border border-border-default bg-bg-secondary/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{item.fullName}</p>
          <p className="text-xs text-text-muted">Nghỉ ngày {formatIsoDate(item.dropOutDate)}</p>
        </div>
        <Link
          href={`/staff/students/${encodeURIComponent(item.studentId)}`}
          prefetch={false}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Xem hồ sơ
        </Link>
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          Lý do nghỉ của {item.fullName}
        </label>
        <input
          id={inputId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={STUDENT_DROP_OUT_REASON_MAX_LENGTH}
          placeholder="Lý do nghỉ học"
          disabled={saveMutation.isPending}
          className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-text-inverse transition hover:opacity-90 disabled:opacity-60"
        >
          {saveMutation.isPending ? "Đang lưu…" : "Lưu"}
        </button>
      </form>
    </li>
  );
}

/**
 * Nhắc CSKH điền bù lý do nghỉ cho học sinh mình phụ trách đã nghỉ trong tháng
 * điền bù (lý do chỉ bắt buộc từ 10/2026). Panel nổi không có backdrop nên không
 * chặn thao tác khác; "Để sau" ẩn tới hết phiên (sessionStorage, xoá khi đăng xuất).
 */
export default function DropOutReasonReminder() {
  // Server snapshot luôn là false để HTML server và lần hydrate đầu khớp nhau.
  const dismissedThisSession = useSyncExternalStore(
    subscribeNoop,
    () => window.sessionStorage.getItem(DROP_OUT_REASON_REMINDER_DISMISS_KEY) === "1",
    () => false,
  );
  const [dismissedLocally, setDismissedLocally] = useState(false);

  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: authApi.getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const isCustomerCare = Boolean(
    fullProfile?.staffInfo?.id && fullProfile.staffInfo.roles?.includes("customer_care"),
  );
  const isDismissed = dismissedThisSession || dismissedLocally;

  const missingReasonsQuery = useQuery({
    queryKey: MISSING_REASONS_QUERY_KEY,
    queryFn: customerCareApi.getMyMissingDropOutReasons,
    enabled: isCustomerCare && !isDismissed,
    staleTime: 60_000,
    retry: false,
  });

  const items = missingReasonsQuery.data?.items ?? [];
  if (!isCustomerCare || isDismissed || items.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    window.sessionStorage.setItem(DROP_OUT_REASON_REMINDER_DISMISS_KEY, "1");
    setDismissedLocally(true);
  };

  const monthLabel = formatMonthKey(missingReasonsQuery.data?.monthKey ?? "");

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="drop-out-reason-reminder-title"
      className="fixed inset-x-3 bottom-3 z-50 flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-warning/40 bg-bg-surface shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[26rem]"
    >
      <header className="border-b border-border-default bg-warning/10 px-4 py-3">
        <h2 id="drop-out-reason-reminder-title" className="text-sm font-semibold text-text-primary">
          Còn {items.length} học sinh nghỉ tháng {monthLabel} chưa có lý do
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          Điền lý do nghỉ cho từng học sinh bạn phụ trách. Lưu xong học sinh tự biến khỏi danh sách.
        </p>
      </header>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {items.map((item) => (
          <DropOutReasonReminderRow key={item.studentId} item={item} />
        ))}
      </ul>

      <footer className="flex justify-end border-t border-border-default px-4 py-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
        >
          Để sau
        </button>
      </footer>
    </section>
  );
}
