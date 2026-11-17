"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  useDeferredValue,
  useMemo,
  useState,
  type SyntheticEvent,
} from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  CreateLessonTaskPayload,
  LessonTaskItem,
  LessonTaskPriority,
  LessonTaskStaffOption,
  LessonTaskStatus,
  LessonUpsertMode,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import {
  formatLessonStaffRoleLabel,
  formatLessonStaffStatusLabel,
  LESSON_TASK_PRIORITY_LABELS,
  LESSON_TASK_STATUS_LABELS,
} from "./lessonTaskUi";

type Props = {
  open: boolean;
  mode: LessonUpsertMode;
  initialData?: LessonTaskItem | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateLessonTaskPayload) => Promise<void> | void;
};

const STATUS_OPTIONS: { value: LessonTaskStatus; label: string }[] = [
  {
    value: "pending",
    label: LESSON_TASK_STATUS_LABELS.pending,
  },
  {
    value: "in_progress",
    label: LESSON_TASK_STATUS_LABELS.in_progress,
  },
  {
    value: "completed",
    label: LESSON_TASK_STATUS_LABELS.completed,
  },
  {
    value: "cancelled",
    label: LESSON_TASK_STATUS_LABELS.cancelled,
  },
];

const PRIORITY_OPTIONS: { value: LessonTaskPriority; label: string }[] = [
  {
    value: "low",
    label: LESSON_TASK_PRIORITY_LABELS.low,
  },
  {
    value: "medium",
    label: LESSON_TASK_PRIORITY_LABELS.medium,
  },
  {
    value: "high",
    label: LESSON_TASK_PRIORITY_LABELS.high,
  },
];

function getPopupTitle(mode: LessonUpsertMode) {
  return mode === "create" ? "Thêm công việc" : "Chỉnh sửa công việc";
}

function mapTaskStaffOption(
  value: LessonTaskItem["assignees"][number] | null | undefined,
) {
  if (!value) {
    return null;
  }

  return {
    id: value.id,
    fullName: value.fullName,
    roles: value.roles,
    status: value.status,
  } satisfies LessonTaskStaffOption;
}

function mapTaskStaffOptions(
  values: LessonTaskItem["assignees"] | null | undefined,
) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  return values
    .map((value) => mapTaskStaffOption(value))
    .filter((value): value is LessonTaskStaffOption => value !== null);
}

function LessonTaskFormPopupContent({
  open,
  mode,
  initialData,
  isSubmitting = false,
  onClose,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(() => initialData?.title ?? "");
  const [description, setDescription] = useState(
    () => initialData?.description ?? "",
  );
  const [status, setStatus] = useState<LessonTaskStatus>(
    () => initialData?.status ?? "pending",
  );
  const [priority, setPriority] = useState<LessonTaskPriority>(
    () => initialData?.priority ?? "medium",
  );
  const [dueDate, setDueDate] = useState(() => initialData?.dueDate ?? "");
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<
    LessonTaskStaffOption[]
  >(() => mapTaskStaffOptions(initialData?.assignees));

  const deferredStaffSearch = useDeferredValue(staffSearch.trim());

  const { data: staffOptions = [], isFetching: isStaffOptionsFetching } =
    useQuery<LessonTaskStaffOption[]>({
      queryKey: ["lesson", "task-staff-options", deferredStaffSearch],
      queryFn: () =>
        lessonApi.searchLessonTaskStaffOptions({
          search: deferredStaffSearch || undefined,
          limit: 6,
        }),
      enabled: open,
      placeholderData: keepPreviousData,
    });

  const resultSummary = useMemo(() => {
    if (isStaffOptionsFetching) {
      return "Đang tìm nhân sự chuyên môn…";
    }

    if (staffOptions.length === 0) {
      return deferredStaffSearch
        ? "Không tìm thấy nhân sự phù hợp với từ khóa hiện tại."
        : "Chưa có gợi ý nhân sự chuyên môn.";
    }

    return deferredStaffSearch
      ? `Có ${staffOptions.length} kết quả gần nhất cho tìm kiếm hiện tại.`
      : "Gợi ý nhanh 6 nhân sự chuyên môn đầu tiên theo hệ thống.";
  }, [deferredStaffSearch, isStaffOptionsFetching, staffOptions.length]);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Tên công việc là bắt buộc.");
      return;
    }

    await onSubmit({
      title: trimmedTitle,
      description: description.trim() || null,
      status,
      priority,
      dueDate: dueDate.trim() || null,
      assigneeStaffIds: selectedAssignees.map((assignee) => assignee.id),
    });
  };

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
        aria-labelledby="lesson-task-form-title"
        className="fixed inset-x-3 top-1/2 z-50 max-h-[90vh] -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[1.75rem] border border-border-default bg-bg-surface p-5 shadow-xl sm:left-1/2 sm:w-full sm:max-w-4xl sm:-translate-x-1/2 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
              Task Desk
            </p>
            <h2
              id="lesson-task-form-title"
              className="mt-2 text-xl font-semibold text-text-primary text-balance"
            >
              {getPopupTitle(mode)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Chọn một danh sách nhân sự thực hiện cho task. Nhân sự đứng tên
              output con chỉ dùng cho thanh toán và không tự ghi đè danh sách này.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng popup công việc"
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

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="flex flex-col gap-4 ">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Tên công việc</span>
                  <input
                    type="text"
                    name="title"
                    autoComplete="off"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ví dụ: Soạn outline buổi 1…"
                    className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Trạng thái</span>
                  <UpgradedSelect
                    name="status"
                    value={status}
                    onValueChange={(value) => setStatus(value as LessonTaskStatus)}
                    options={STATUS_OPTIONS}
                    ariaLabel="Trạng thái công việc"
                    placeholder="Chọn trạng thái"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Ưu tiên</span>
                  <UpgradedSelect
                    name="priority"
                    value={priority}
                    onValueChange={(value) =>
                      setPriority(value as LessonTaskPriority)
                    }
                    options={PRIORITY_OPTIONS}
                    ariaLabel="Mức ưu tiên công việc"
                    placeholder="Chọn mức ưu tiên"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Hạn xử lý</span>
                  <DateInput
                    name="dueDate"
                    autoComplete="off"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Mô tả</span>
                  <textarea
                    name="description"
                    autoComplete="off"
                    rows={6}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ghi rõ checklist, kỳ vọng đầu ra hoặc ghi chú handoff…"
                    className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      Nhân sự thực hiện
                    </p>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      Danh sách này quyết định ai được giao thực hiện task và ai
                      được xem task trong participant workspace.
                    </p>
                  </div>
                  {selectedAssignees.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedAssignees([])}
                      className="rounded-full border border-border-default bg-bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Xóa tất cả
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selectedAssignees.length > 0 ? (
                    selectedAssignees.map((assignee) => (
                      <div
                        key={assignee.id}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-border-default bg-bg-surface p-3"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-text-primary">
                            {assignee.fullName}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {formatLessonStaffRoleLabel(assignee.roles)}
                          </p>
                          <p className="mt-2 text-xs text-text-muted">
                            {formatLessonStaffStatusLabel(assignee.status)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAssignees((current) =>
                              current.filter((item) => item.id !== assignee.id),
                            )
                          }
                          className="rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          Gỡ
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface px-4 py-5 text-sm text-text-muted sm:col-span-2">
                      Chưa gán nhân sự thực hiện. Nếu để trống, task sẽ
                      không hiện trong participant workspace của staff thường.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-4 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Tìm nhân sự chuyên môn
                </p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Chọn một hoặc nhiều nhân sự để thực hiện task này.
                </p>
              </div>
              <p
                className="text-xs text-text-muted"
                aria-live="polite"
              >
                {resultSummary}
              </p>
            </div>

            <div className="mt-4">
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tìm theo họ tên</span>
                <input
                  type="search"
                  name="staffSearch"
                  autoComplete="off"
                  value={staffSearch}
                  onChange={(event) => setStaffSearch(event.target.value)}
                  placeholder="Nhập tên nhân sự chuyên môn…"
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3">
              {staffOptions.length > 0 ? (
                staffOptions.map((staff) => {
                  const isAssignee = selectedAssignees.some(
                    (assignee) => assignee.id === staff.id,
                  );

                  return (
                    <article
                      key={staff.id}
                      className="rounded-2xl border border-border-default bg-bg-secondary/50 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-text-primary">
                            {staff.fullName}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {formatLessonStaffRoleLabel(staff.roles)}
                          </p>
                          <p className="mt-2 text-xs text-text-muted">
                            {formatLessonStaffStatusLabel(staff.status)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedAssignees((current) =>
                                current.some((item) => item.id === staff.id)
                                  ? current.filter((item) => item.id !== staff.id)
                                  : [...current, staff],
                              )
                            }
                            className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                              isAssignee
                                ? "border border-success/25 bg-success/10 text-success"
                                : "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-tertiary"
                            }`}
                          >
                            {isAssignee ? "Đang thực hiện" : "Thêm thực hiện"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/40 px-4 py-8 text-sm text-text-muted">
                  {deferredStaffSearch
                    ? "Không có kết quả phù hợp. Thử đổi từ khóa ngắn hơn hoặc đúng họ tên hơn."
                    : "Không có gợi ý nhân sự chuyên môn ở thời điểm hiện tại."}
                </div>
              )}
            </div>
          </section>

          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              {isSubmitting
                ? "Đang lưu…"
                : mode === "create"
                  ? "Tạo công việc"
                  : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function LessonTaskFormPopup(props: Props) {
  const { open, mode, initialData } = props;

  if (!open) return null;

  const formKey = [
    mode,
    initialData?.id ?? "new",
  ].join(":");

  return <LessonTaskFormPopupContent key={formKey} {...props} />;
}
