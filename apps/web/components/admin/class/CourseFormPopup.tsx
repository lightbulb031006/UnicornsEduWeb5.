"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveActionFooter,
} from "@/components/ui/ResponsiveDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Course } from "@/dtos/class.dto";

export type CourseFormValues = {
  name: string;
  sortOrder: number;
  /** Số ngày thời hạn mặc định. null = vô hạn. */
  defaultDurationDays: number | null;
};

type Props = {
  open: boolean;
  course: Course | null;
  onClose: () => void;
  onSubmit: (values: CourseFormValues) => Promise<void>;
};

export default function CourseFormPopup({ open, course, onClose, onSubmit }: Props) {
  const isEdit = Boolean(course);
  const [name, setName] = useState("");
  const [sortOrderInput, setSortOrderInput] = useState("0");
  const [durationInput, setDurationInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(course?.name ?? "");
    setSortOrderInput(String(course?.sortOrder ?? 0));
    setDurationInput(
      course?.defaultDurationDays != null ? String(course.defaultDurationDays) : "",
    );
  }, [open, course]);

  if (!open) return null;

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Tên khoá học là bắt buộc.");
      return;
    }
    const sortOrder = Number(sortOrderInput);
    if (!Number.isFinite(sortOrder)) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }
    let defaultDurationDays: number | null = null;
    const trimmedDuration = durationInput.trim();
    if (trimmedDuration) {
      defaultDurationDays = Number(trimmedDuration);
      if (!Number.isInteger(defaultDurationDays) || defaultDurationDays < 1) {
        toast.error("Thời hạn mặc định phải là số ngày nguyên dương.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        sortOrder: Math.trunc(sortOrder),
        defaultDurationDays,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog labelledBy="course-form-title" onBackdropClick={onClose}>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle p-4 sm:p-5">
          <h2 id="course-form-title" className="text-lg font-semibold text-text-primary">
            {isEdit ? "Sửa khoá học" : "Thêm khoá học"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ResponsiveDialogBody className="space-y-4">
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            <span>Tên hiển thị</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            <span>
              Thời hạn mặc định (số ngày)
            </span>
            <input
              type="number"
              min={1}
              placeholder="Để trống = vô hạn"
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
            <span className="text-xs text-text-muted">
              Số ngày mặc định khi tạo lớp từ khoá này. Để trống nghĩa là vô hạn.
            </span>
          </label>

          {isEdit ? (
            <Alert variant="warning">
              <AlertDescription>
                Chỉ áp dụng cho lớp tạo mới — Lớp đang chạy giữ nguyên hạn đã
                đặt. Đổi hạn từng lớp ở trang lớp.
              </AlertDescription>
            </Alert>
          ) : null}

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            <span>Thứ tự hiển thị</span>
            <input
              type="number"
              value={sortOrderInput}
              onChange={(e) => setSortOrderInput(e.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </label>
        </ResponsiveDialogBody>

        <ResponsiveActionFooter>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary sm:min-h-10"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
          >
            {submitting ? "Đang lưu..." : "Lưu"}
          </button>
        </ResponsiveActionFooter>
      </form>
    </ResponsiveDialog>
  );
}
