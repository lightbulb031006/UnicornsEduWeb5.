"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  useDeferredValue,
  useState,
  type SyntheticEvent,
} from "react";
import { toast } from "sonner";
import type {
  CreateLessonResourcePayload,
  LessonResourceItem,
  LessonTaskOption,
  LessonUpsertMode,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import LessonTagPicker from "./LessonTagPicker";
import { formatVnDate } from "@/lib/formatters";
import {
  LESSON_TASK_PRIORITY_LABELS,
  LESSON_TASK_STATUS_LABELS,
  lessonTaskPriorityChipClass,
  lessonTaskStatusChipClass,
} from "./lessonTaskUi";

type Props = {
  open: boolean;
  mode: LessonUpsertMode;
  initialData?: LessonResourceItem | null;
  linkedTask?: Pick<LessonTaskOption, "id" | "title"> | null;
  requireTaskSelection?: boolean;
  isSubmitting?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onRetry?: () => void;
  onSubmit: (payload: CreateLessonResourcePayload) => Promise<void> | void;
};

function getTitle(mode: LessonUpsertMode) {
  return mode === "create" ? "Thêm tài nguyên" : "Chỉnh sửa tài nguyên";
}

function formatLessonDate(value: string | null) {
  if (!value) {
    return "Chưa có deadline";
  }

  return formatVnDate(new Date(value));
}

function LessonResourceFormPopupContent({
  open,
  mode,
  initialData,
  linkedTask = null,
  requireTaskSelection = false,
  isSubmitting = false,
  isLoading = false,
  isError = false,
  errorMessage = "Không tải được tài nguyên.",
  onClose,
  onRetry,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(() => initialData?.title ?? "");
  const [resourceLink, setResourceLink] = useState(
    () => initialData?.resourceLink ?? "",
  );
  const [description, setDescription] = useState(
    () => initialData?.description ?? "",
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(() =>
    initialData?.tags ?? [],
  );
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<LessonTaskOption | null>(null);
  const deferredTaskSearch = useDeferredValue(taskSearch.trim());

  const { data: taskOptions = [], isFetching: isTaskOptionsFetching } = useQuery({
    queryKey: [
      "lesson",
      "task-options",
      "resource-popup",
      deferredTaskSearch,
    ],
    queryFn: () =>
      lessonApi.searchLessonTaskOptions({
        search: deferredTaskSearch || undefined,
        limit: 6,
      }),
    enabled: open && requireTaskSelection && !linkedTask,
    placeholderData: keepPreviousData,
  });

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedLink = resourceLink.trim();

    if (!trimmedTitle) {
      toast.error("Tên tài nguyên là bắt buộc.");
      return;
    }

    if (!trimmedLink) {
      toast.error("Link tài nguyên là bắt buộc.");
      return;
    }

    try {
      const url = new URL(trimmedLink);
      if (!["http:", "https:"].includes(url.protocol)) {
        toast.error("Link tài nguyên phải bắt đầu bằng http hoặc https.");
        return;
      }
    } catch {
      toast.error("Link tài nguyên không hợp lệ.");
      return;
    }

    const resolvedLessonTaskId =
      linkedTask?.id ?? selectedTask?.id ?? initialData?.lessonTaskId ?? null;

    if (requireTaskSelection && !linkedTask && !resolvedLessonTaskId) {
      toast.error("Hãy chọn task cần gắn tài nguyên.");
      return;
    }

    await onSubmit({
      title: trimmedTitle,
      resourceLink: trimmedLink,
      description: description.trim() || null,
      lessonTaskId: resolvedLessonTaskId,
      tags: selectedTags,
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
        aria-labelledby="lesson-resource-form-title"
        className="fixed inset-x-3 top-1/2 z-50 max-h-[88vh] -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-border-default bg-bg-surface p-5 shadow-xl sm:left-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
              Resource Desk
            </p>
            <h2
              id="lesson-resource-form-title"
              className="mt-2 text-xl font-semibold text-text-primary"
            >
              {getTitle(mode)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Lưu tài nguyên tham chiếu để đội giáo án truy cập lại nhanh trong
              tab Tổng quan.
            </p>
            {linkedTask ? (
              <div className="mt-4 rounded-[1.25rem] border border-primary/15 bg-primary/8 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/75">
                  Task đích
                </p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  {linkedTask.title ?? "Task chưa đặt tên"}
                </p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Resource tạo mới từ popup này sẽ được gắn trực tiếp vào công
                  việc đang mở.
                </p>
              </div>
            ) : requireTaskSelection ? (
              <div className="mt-4 rounded-[1.25rem] border border-primary/15 bg-primary/8 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/75">
                  Task đích
                </p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  {selectedTask?.title?.trim() || "Chọn task bạn đang tham gia"}
                </p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Tài nguyên của staff giáo án thường phải được gắn vào đúng
                  task backend xác nhận bạn đang tham gia.
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
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

        {isLoading ? (
          <div className="space-y-4">
            <section className="rounded-[1.4rem] border border-border-default bg-bg-surface p-4 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <div className="h-4 w-28 animate-pulse rounded-full bg-bg-tertiary/80" />
                  <div className="h-11 animate-pulse rounded-xl bg-bg-tertiary/70" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="h-4 w-24 animate-pulse rounded-full bg-bg-tertiary/80" />
                  <div className="h-11 animate-pulse rounded-xl bg-bg-tertiary/70" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="h-4 w-20 animate-pulse rounded-full bg-bg-tertiary/80" />
                  <div className="h-28 animate-pulse rounded-xl bg-bg-tertiary/70" />
                </div>
              </div>
            </section>
            <section className="rounded-[1.4rem] border border-border-default bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ue-bg-secondary)_70%,transparent),color-mix(in_srgb,var(--ue-bg-surface)_96%,transparent))] p-4 shadow-sm">
              <div className="h-4 w-16 animate-pulse rounded-full bg-bg-tertiary/80" />
              <div className="mt-4 h-12 animate-pulse rounded-xl bg-bg-tertiary/70" />
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="h-8 w-24 animate-pulse rounded-full bg-bg-tertiary/75" />
                <div className="h-8 w-20 animate-pulse rounded-full bg-bg-tertiary/60" />
              </div>
            </section>
          </div>
        ) : isError ? (
          <div className="rounded-[1.4rem] border border-dashed border-border-default bg-bg-secondary/35 px-5 py-10 text-center">
            <p className="text-base font-semibold text-text-primary">
              Không tải được tài nguyên.
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {errorMessage}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Tải lại
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {requireTaskSelection && !linkedTask ? (
              <section className="rounded-[1.35rem] border border-border-default bg-bg-secondary/25 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Parent Task
                    </p>
                    <p className="mt-2 text-base font-semibold text-text-primary">
                      {selectedTask?.title?.trim() || "Chọn task bạn đang tham gia"}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                      Chỉ hiện những task backend xác nhận bạn đang tham gia.
                    </p>
                  </div>

                  {selectedTask ? (
                    <button
                      type="button"
                      onClick={() => setSelectedTask(null)}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Chọn task khác
                    </button>
                  ) : null}
                </div>

                <label className="mt-4 flex flex-col gap-1.5 text-sm text-text-secondary">
                  <span>Tìm task</span>
                  <input
                    type="search"
                    value={taskSearch}
                    onChange={(event) => setTaskSearch(event.target.value)}
                    placeholder="Nhập tên task giáo án..."
                    className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>

                {selectedTask ? (
                  <article className="mt-4 rounded-[1.2rem] border border-primary/15 bg-primary/6 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">
                          {selectedTask.title?.trim() || "Task chưa đặt tên"}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          Deadline: {formatLessonDate(selectedTask.dueDate)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskStatusChipClass(
                            selectedTask.status,
                          )}`}
                        >
                          {LESSON_TASK_STATUS_LABELS[selectedTask.status]}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskPriorityChipClass(
                            selectedTask.priority,
                          )}`}
                        >
                          {LESSON_TASK_PRIORITY_LABELS[selectedTask.priority]}
                        </span>
                      </div>
                    </div>
                  </article>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {taskOptions.length > 0 ? (
                      taskOptions.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="rounded-[1.2rem] border border-border-default bg-bg-surface px-4 py-3 text-left transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">
                                {task.title?.trim() || "Task chưa đặt tên"}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                Deadline: {formatLessonDate(task.dueDate)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskStatusChipClass(
                                  task.status,
                                )}`}
                              >
                                {LESSON_TASK_STATUS_LABELS[task.status]}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskPriorityChipClass(
                                  task.priority,
                                )}`}
                              >
                                {LESSON_TASK_PRIORITY_LABELS[task.priority]}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-[1.2rem] border border-dashed border-border-default bg-bg-surface/75 px-4 py-6 text-sm text-text-muted">
                        {isTaskOptionsFetching
                          ? "Đang tải task bạn tham gia..."
                          : deferredTaskSearch
                            ? "Không tìm thấy task phù hợp."
                            : "Chưa có task nào khả dụng để gắn tài nguyên."}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            <section className="rounded-[1.4rem] border border-border-default bg-bg-surface p-4 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Tên tài nguyên</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ví dụ: Bộ note đại số tổ hợp"
                    className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Link tài nguyên</span>
                  <input
                    type="url"
                    value={resourceLink}
                    onChange={(event) => setResourceLink(event.target.value)}
                    placeholder="https://..."
                    className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Mô tả</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Nội dung ngắn mô tả mục đích dùng của tài nguyên này."
                    className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[1.4rem] border border-border-default bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ue-bg-secondary)_70%,transparent),color-mix(in_srgb,var(--ue-bg-surface)_96%,transparent))] p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Tags
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Gắn tag để gom tài nguyên theo chuyên đề, tuần học hoặc định dạng tài liệu.
                  </p>
                </div>
                <span className="text-xs text-text-muted">
                  {selectedTags.length > 0
                    ? `${selectedTags.length} tag đang được gắn`
                    : "Chưa gắn tag nào"}
                </span>
              </div>

              <div className="mt-4">
                <LessonTagPicker
                  value={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="Tìm kiếm hoặc tạo tag cho tài nguyên…"
                />
              </div>

              {selectedTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-border-default bg-bg-secondary/70 p-3">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border-default bg-bg-surface px-3 py-1 text-xs font-medium text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
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
                    ? "Tạo tài nguyên"
                    : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

export default function LessonResourceFormPopup(props: Props) {
  const { open, mode, initialData, linkedTask, requireTaskSelection } = props;

  if (!open) return null;

  const formKey = [
    mode,
    initialData?.id ?? "new",
    initialData?.updatedAt ?? "new",
    linkedTask?.id ?? "no-linked-task",
    requireTaskSelection ? "task-required" : "task-optional",
  ].join(":");

  return <LessonResourceFormPopupContent key={formKey} {...props} />;
}
