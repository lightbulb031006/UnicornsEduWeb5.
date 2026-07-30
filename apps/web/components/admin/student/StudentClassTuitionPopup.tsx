"use client";

import { useState, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";

type Props = {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  studentId: string;
  /** Giá trị hiện tại từ class detail (student trong lớp). */
  initialPackageTotal: number | null;
  initialPackageSession: number | null;
  onSuccess?: () => void | Promise<void>;
};

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "string") return parseMoneyInput(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function StudentClassTuitionPopupContent({
  onClose,
  classId,
  className,
  studentId,
  initialPackageTotal,
  initialPackageSession,
  onSuccess,
}: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const [packageTotal, setPackageTotal] = useState(() =>
    moneyInputInitialFromNumber(initialPackageTotal),
  );
  const [packageSession, setPackageSession] = useState(
    () => (initialPackageSession != null ? String(initialPackageSession) : ""),
  );

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const totalNum = toNum(packageTotal.trim());
    const sessionNum = toNum(packageSession.trim());
    if (totalNum != null && (sessionNum == null || sessionNum < 1)) {
      toast.error("Số buổi trong gói phải là số nguyên dương.");
      return;
    }
    if (sessionNum != null && (totalNum == null || totalNum < 0)) {
      toast.error("Tổng gói học phí không hợp lệ.");
      return;
    }
    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu gói học phí...",
      successMessage: "Đã lưu gói học phí.",
      errorMessage: "Không thể cập nhật gói học phí.",
      action: async () => {
        const totalNum = toNum(packageTotal.trim());
        const sessionNum = toNum(packageSession.trim());

        await classApi.updateClassStudentTuition(classId, {
          student_id: studentId,
          custom_tuition_package_total: totalNum ?? 0,
          custom_tuition_package_session: sessionNum ?? 0,
        });
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["student", "detail", studentId] }),
          queryClient.invalidateQueries({ queryKey: ["student", "list"] }),
          queryClient.invalidateQueries({ queryKey: ["class", "detail", classId] }),
        ]);
        await onSuccess?.();
      },
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 p-2 sm:p-4">
        <div className="mx-auto flex h-full w-full max-w-md items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-class-tuition-title"
            className="w-full rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-border-default/70 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                  Gói học phí
                </p>
                <h2 id="student-class-tuition-title" className="mt-1 text-lg font-semibold text-text-primary">
                  Điều chỉnh gói học phí
                </h2>
                <p className="mt-1 truncate text-sm text-text-secondary">{className}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Đóng"
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">Tổng gói (VNĐ)</span>
                <MoneyInput
                  value={packageTotal}
                  onValueChange={setPackageTotal}
                  placeholder="Để trống = theo lớp"
                  className="w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">Số buổi trong gói</span>
                <input
                  type="number"
                  min={1}
                  value={packageSession}
                  onChange={(e) => setPackageSession(e.target.value)}
                  placeholder="Để trống = theo lớp"
                  className="w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 flex-1 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="min-h-11 flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export default function StudentClassTuitionPopup(props: Props) {
  const {
    open,
    classId,
    studentId,
    initialPackageTotal,
    initialPackageSession,
  } = props;

  if (!open) return null;

  const popupKey = [
    classId,
    studentId,
    initialPackageTotal ?? "no-total",
    initialPackageSession ?? "no-session",
  ].join(":");

  return <StudentClassTuitionPopupContent key={popupKey} {...props} />;
}
