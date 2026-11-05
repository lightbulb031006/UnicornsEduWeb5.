"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, FileCheck2, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { ExamPrintTarget } from "@/dtos/exam-print.dto";
import { downloadExamPrint } from "@/lib/apis/exam-print.api";
import { triggerBlobDownload } from "@/lib/blob-download";
import { cn } from "@/lib/utils";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";

const TITLE_ID = "print-exam-dialog-title";
const DESCRIPTION_ID = "print-exam-dialog-description";

const DEFAULT_TRIGGER_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-bg-surface px-3 text-sm font-medium text-text-primary hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

interface PrintExamButtonProps {
  target: ExamPrintTarget;
  disabled?: boolean;
  /** Thay hẳn class mặc định của nút mở (khớp kiểu nút xung quanh). */
  className?: string;
  iconClassName?: string;
}

const VARIANTS = [
  {
    withAnswers: false,
    label: "Đề",
    description:
      "Đề trắng theo form đề thi tốt nghiệp THPT, phát cho học sinh làm.",
    Icon: FileText,
  },
  {
    withAnswers: true,
    label: "Đề + đáp án",
    description:
      "Thêm trang đáp án ở cuối: phương án đúng Phần I, Đ/S từng ý Phần II. Không in giải thích.",
    Icon: FileCheck2,
  },
] as const;

/**
 * Nút **In đề** (CONTEXT.md — Đề in). Học sinh tải thẳng bản Đề; phía dạy chọn
 * Đề hoặc Đề + đáp án trong dialog.
 */
export function PrintExamButton({
  target,
  disabled = false,
  className,
  iconClassName,
}: PrintExamButtonProps) {
  const isStudent = target.kind === "student-assignment";
  const [open, setOpen] = useState(false);

  const download = useMutation({
    mutationFn: (withAnswers: boolean) =>
      downloadExamPrint(target, withAnswers),
    onMutate: () => ({ toastId: toast.loading("Đang tạo PDF đề…") }),
    onSuccess: ({ blob, filename }, _withAnswers, context) => {
      triggerBlobDownload(blob, filename);
      toast.success("Đã tải đề PDF.", { id: context?.toastId });
      setOpen(false);
    },
    onError: (error, _withAnswers, context) => {
      toast.error(getMutationErrorMessage(error, "Không tạo được PDF đề."), {
        id: context?.toastId,
      });
    },
  });

  const close = () => {
    if (!download.isPending) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || download.isPending}
        onClick={() => (isStudent ? download.mutate(false) : setOpen(true))}
        className={className ?? DEFAULT_TRIGGER_CLASS}
        title={disabled ? "Tiết chưa có câu hỏi để in." : undefined}
      >
        {download.isPending && isStudent ? (
          <Loader2
            className={cn("size-4 animate-spin", iconClassName)}
            aria-hidden
          />
        ) : (
          <Printer className={cn("size-4", iconClassName)} aria-hidden />
        )}
        In đề
      </button>

      {open ? (
        <ResponsiveDialog
          size="md"
          labelledBy={TITLE_ID}
          describedBy={DESCRIPTION_ID}
          onBackdropClick={close}
        >
          <div className="flex flex-col gap-4 overflow-y-auto p-5 sm:p-6">
            <div>
              <h2
                id={TITLE_ID}
                className="text-lg font-semibold text-text-primary"
              >
                In đề
              </h2>
              <p
                id={DESCRIPTION_ID}
                className="mt-1 text-sm text-text-secondary"
              >
                PDF khổ A4, theo thứ tự gốc của tiết (không đảo câu).
              </p>
            </div>
            <div className="grid gap-2">
              {VARIANTS.map(({ withAnswers, label, description, Icon }) => {
                const pending =
                  download.isPending && download.variables === withAnswers;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={download.isPending}
                    onClick={() => download.mutate(withAnswers)}
                    className="flex min-h-14 w-full cursor-pointer items-start gap-3 rounded-lg border border-border-default p-3 text-left hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2
                        className="mt-0.5 size-5 shrink-0 animate-spin text-primary"
                        aria-hidden
                      />
                    ) : (
                      <Icon
                        className="mt-0.5 size-5 shrink-0 text-primary"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text-primary">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-secondary">
                        {description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={close}
                disabled={download.isPending}
                className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Huỷ
              </button>
            </div>
          </div>
        </ResponsiveDialog>
      ) : null}
    </>
  );
}
