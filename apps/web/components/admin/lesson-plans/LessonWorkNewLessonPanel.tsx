"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import type {
  CreateLessonOutputPayload,
  LessonTaskOption,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import {
  LESSON_TASK_PRIORITY_LABELS,
  LESSON_TASK_STATUS_LABELS,
  lessonTaskPriorityChipClass,
  lessonTaskStatusChipClass,
} from "./lessonTaskUi";
import LessonOutputEditorForm from "./LessonOutputEditorForm";
import LessonOutputQuickPopup from "./LessonOutputQuickPopup";

function getErrorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function formatLessonDate(value: string | null) {
  if (!value) {
    return "Chưa có deadline";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

type Props = {
  title?: string;
  description?: string;
  allowTasklessOutput?: boolean;
  requireTaskSelection?: boolean;
  hideStaffFields?: boolean;
  forceSharedLayout?: boolean;
  allowPaymentStatusEdit?: boolean;
  openAfterCreate?: "popup" | "none";
};

export default function LessonWorkNewLessonPanel({
  title = "Thêm bài mới",
  description = "",
  allowTasklessOutput = true,
  requireTaskSelection = false,
  hideStaffFields = true,
  forceSharedLayout = true,
  allowPaymentStatusEdit = true,
  openAfterCreate = "popup",
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<LessonTaskOption | null>(null);
  const deferredTaskSearch = useDeferredValue(taskSearch.trim());

  const { data: taskOptions = [], isFetching: isTaskOptionsFetching } = useQuery({
    queryKey: ["lesson", "task-options", "work-new-panel", deferredTaskSearch],
    queryFn: () =>
      lessonApi.searchLessonTaskOptions({
        search: deferredTaskSearch || undefined,
        limit: 6,
      }),
    enabled: open && requireTaskSelection,
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateLessonOutputPayload) =>
      lessonApi.createLessonOutput(payload),
    onSuccess: (output) => {
      toast.success("Đã thêm bài.");
      setOpen(false);
      if (openAfterCreate === "popup") {
        setSelectedOutputId(output.id);
      }
      void queryClient.invalidateQueries({ queryKey: ["lesson"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không tạo được bài."));
    },
  });

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-border-default/60 bg-bg-secondary/40 shadow-none">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:px-5"
        aria-expanded={open}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <svg
            className="size-4 shrink-0 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="truncate">{title}</span>
        </span>

        <svg
          className={`size-5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 15l7-7 7 7"
          />
        </svg>
      </button>

      {open ? (
        <div className="border-t border-border-default/60 px-4 pb-5 pt-4 sm:px-5 sm:pb-6">
          <div className="space-y-4">
            {description ? (
              <div className="rounded-[1.25rem] border border-border-default bg-bg-secondary/35 px-4 py-3 text-sm leading-6 text-text-secondary">
                {description}
              </div>
            ) : null}

            {requireTaskSelection ? (
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
                            : "Chưa có task nào khả dụng để gắn output."}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {!requireTaskSelection || selectedTask ? (
              <LessonOutputEditorForm
                mode="create"
                initialTask={
                  selectedTask
                    ? {
                        id: selectedTask.id,
                        title: selectedTask.title,
                      }
                    : null
                }
                showParentTaskBanner={false}
                hideStaffFields={hideStaffFields}
                forceSharedLayout={forceSharedLayout}
                allowTasklessOutput={requireTaskSelection ? false : allowTasklessOutput}
                allowPaymentStatusEdit={allowPaymentStatusEdit}
                isSubmitting={createMutation.isPending}
                onCancel={() => setOpen(false)}
                onSubmit={async (payload) => {
                  await createMutation.mutateAsync(payload);
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {openAfterCreate === "popup" ? (
        <LessonOutputQuickPopup
          open={Boolean(selectedOutputId)}
          outputId={selectedOutputId}
          forceSharedLayout
          onClose={() => setSelectedOutputId(null)}
        />
      ) : null}
    </div>
  );
}
