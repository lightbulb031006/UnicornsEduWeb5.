"use client";

import type {
  CreateLessonOutputPayload,
  LessonUpsertMode,
} from "@/dtos/lesson.dto";
import LessonOutputEditorForm from "./LessonOutputEditorForm";

type Props = {
  open: boolean;
  mode: LessonUpsertMode;
  task: {
    id: string;
    title: string | null;
  } | null;
  hideStaffFields?: boolean;
  forceSharedLayout?: boolean;
  allowTasklessOutput?: boolean;
  allowPaymentStatusEdit?: boolean;
  /** #279: `false` = khoá bậc độ khó / level / hạng mục. */
  allowCostEdit?: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateLessonOutputPayload) => Promise<void> | void;
};

function getPopupTitle(mode: LessonUpsertMode) {
  return mode === "create" ? "Tạo lesson output" : "Chỉnh sửa lesson output";
}

export default function LessonOutputFormPopup({
  open,
  mode,
  task,
  hideStaffFields = false,
  forceSharedLayout = false,
  allowTasklessOutput = false,
  allowPaymentStatusEdit = true,
  allowCostEdit = true,
  isSubmitting = false,
  onClose,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-output-form-title"
        className="fixed inset-x-3 top-1/2 z-50 max-h-[90vh] -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[1.75rem] border border-border-default bg-bg-surface p-5 shadow-xl sm:left-1/2 sm:w-full sm:max-w-5xl sm:-translate-x-1/2 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
              Output Desk
            </p>
            <h2
              id="lesson-output-form-title"
              className="mt-2 text-xl font-semibold text-text-primary text-balance"
            >
              {getPopupTitle(mode)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Điền đầy đủ metadata cho output trong đúng ngữ cảnh task; sau khi tạo
              xong có thể chỉnh tiếp ngay trong popup chi tiết của workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng popup lesson output"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <LessonOutputEditorForm
          mode={mode}
          initialTask={task}
          hideStaffFields={hideStaffFields}
          forceSharedLayout={forceSharedLayout}
          allowTasklessOutput={allowTasklessOutput}
          allowPaymentStatusEdit={allowPaymentStatusEdit}
          allowCostEdit={allowCostEdit}
          isSubmitting={isSubmitting}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      </div>
    </>
  );
}
