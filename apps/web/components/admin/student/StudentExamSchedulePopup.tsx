"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { BodyPortal } from "@/components/ui/BodyPortal";
import { DateInput } from "@/components/ui/DateInput";
import { createClientId } from "@/lib/client-id";
import type { StudentExamItem } from "./StudentExamCard";

type Props = {
  open: boolean;
  onClose: () => void;
  items: StudentExamItem[];
  onItemsChange: (nextItems: StudentExamItem[]) => void;
  onSave: (nextItems: StudentExamItem[]) => void;
};

function createLocalId(): string {
  return `local-exam-${createClientId()}`;
}

function normalizeExamDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? trimmed : "";
}

export default function StudentExamSchedulePopup({
  open,
  onClose,
  items,
  onItemsChange,
  onSave,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const handleCreateExam = () => {
    const timestamp = new Date().toISOString();
    onItemsChange([
      ...items,
      {
        id: createLocalId(),
        examDate: "",
        note: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
  };

  const handleSave = () => {
    const normalizedItems = items.map((item) => ({
      ...item,
      examDate: normalizeExamDate(item.examDate),
      note: item.note?.trim() || "",
    }));

    const hasInvalidItem = normalizedItems.some(
      (item) => (item.examDate || item.note) && !item.examDate,
    );
    if (hasInvalidItem) {
      toast.error("Ngày thi không hợp lệ. Vui lòng chọn ngày cho từng lịch thi.");
      return;
    }

    onSave(normalizedItems.filter((item) => item.examDate));
  };

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-exam-popup-title"
        className="fixed inset-x-3 bottom-3 top-16 z-50 flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-surface shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88vh] sm:w-[min(42rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="border-b border-border-default bg-bg-surface px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Lịch thi
              </p>
              <h2
                id="student-exam-popup-title"
                className="mt-1 text-lg font-semibold text-text-primary"
              >
                Quản lý lịch thi
              </h2>

            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border-default bg-bg-surface p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng popup lịch thi"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 sm:px-5">


          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleCreateExam}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Thêm lịch thi
            </button>
          </div>

          {items.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border-default bg-bg-surface px-4 py-5 text-sm text-text-muted">
              Chưa có lịch thi nào. Dùng nút phía trên để thêm mới.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-[1.15rem] border border-border-default bg-bg-surface px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      Kỳ thi #{index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => onItemsChange(items.filter((exam) => exam.id !== item.id))}
                      className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label="Xóa lịch thi"
                      title="Xóa lịch thi"
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Ngày thi
                      </span>
                      <DateInput
                        value={item.examDate}
                        onChange={(event) =>
                          onItemsChange(
                            items.map((exam) =>
                              exam.id === item.id ? { ...exam, examDate: event.target.value } : exam,
                            ),
                          )
                        }
                        className="rounded-xl border border-border-default bg-bg-surface px-3.5 py-3 text-sm text-text-primary shadow-sm transition-colors focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Ghi chú kỳ thi
                      </span>
                      <input
                        value={item.note ?? ""}
                        onChange={(event) =>
                          onItemsChange(
                            items.map((exam) =>
                              exam.id === item.id ? { ...exam, note: event.target.value } : exam,
                            ),
                          )
                        }
                        placeholder="Ví dụ: Thi cuối kỳ / Thi chứng chỉ / Thi HSG…"
                        className="rounded-xl border border-border-default bg-bg-surface px-3.5 py-3 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted/80 focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-default px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Lưu lịch thi
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}
