"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { courseKeys } from "@/lib/query-keys";
import { invalidateCoursePracticeLessonQueries } from "@/lib/query-invalidation";
import { CourseContentListSkeleton } from "@/components/course-workspace/CourseWorkspaceSkeletons";
import {
  confirmOrderDirtyLeave,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import type { CourseLesson } from "@/dtos/course-content.dto";
import {
  lessonKindBadgeClass,
  lessonKindLabel,
} from "@/lib/course-content-labels";
import { RowActionsMenu } from "@/components/course-workspace/RowActionsMenu";
import {
  OrderSaveBar,
  SortableOrderList,
  SortableRow,
  useOrderDraft,
} from "@/components/course-workspace/SortableOrderList";

function lessonMeta(lesson: CourseLesson): string {
  if (lesson.kind === "theory") {
    const n = lesson.quizCount ?? 0;
    return `${n} bài tập ôn nhẹ`;
  }
  const n = lesson.questionCount ?? 0;
  return `${n} câu hỏi`;
}

export function CourseLessonsPanel({
  courseId,
  moduleId,
  canEdit,
  onBack,
  onOpenLesson,
  onCreateLesson,
  onOrderDirtyChange,
}: {
  courseId: string;
  moduleId: string;
  canEdit: boolean;
  onBack: () => void;
  onOpenLesson: (lesson: CourseLesson) => void;
  onCreateLesson: () => void;
  onOrderDirtyChange?: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();

  const { data: courseModule, isLoading: moduleLoading } = useQuery({
    queryKey: courseKeys.module(courseId, moduleId),
    queryFn: () => classApi.getModule(courseId, moduleId),
    enabled: Boolean(courseId && moduleId),
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: courseKeys.lessons(courseId, moduleId),
    queryFn: () => classApi.getLessonsByModule(courseId, moduleId),
    enabled: Boolean(courseId && moduleId),
  });

  const { items, orderDirty, applyDrag, discard } = useOrderDraft(
    lessons,
    `${courseId}:${moduleId}`,
  );

  useEffect(() => {
    onOrderDirtyChange?.(orderDirty);
    return () => onOrderDirtyChange?.(false);
  }, [orderDirty, onOrderDirtyChange]);

  const invalidate = () => invalidateCoursePracticeLessonQueries(queryClient, courseId);

  const deleteMutation = useMutation({
    mutationFn: (lessonId: string) =>
      classApi.deleteCourseLesson(courseId, moduleId, lessonId),
    onSuccess: () => {
      toast.success("Đã xoá tiết học.");
      discard();
      void invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể xoá tiết học.");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (lessonIds: string[]) =>
      classApi.reorderCourseLessons(courseId, moduleId, lessonIds),
    onSuccess: () => {
      toast.success("Đã lưu thứ tự tiết học.");
      discard();
      void invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể sắp xếp tiết học.");
    },
  });

  const goBack = async () => {
    if (!(await confirmOrderDirtyLeave(confirm, orderDirty))) return;
    discard();
    onBack();
  };

  const openLesson = async (lesson: CourseLesson) => {
    if (!(await confirmOrderDirtyLeave(confirm, orderDirty))) return;
    discard();
    onOpenLesson(lesson);
  };

  const createLesson = async () => {
    if (!(await confirmOrderDirtyLeave(confirm, orderDirty))) return;
    discard();
    onCreateLesson();
  };

  const requestDelete = async (lesson: CourseLesson) => {
    const ok = await confirm({
      title: "Xoá tiết học?",
      description: `Xoá tiết học "${lesson.title}"? Không xoá được nếu lớp đang dùng nội dung này.`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    deleteMutation.mutate(lesson.id);
  };

  const isLoading = moduleLoading || lessonsLoading;
  const canReorder = canEdit && items.length > 1;

  if (isLoading) {
    return <CourseContentListSkeleton label="Đang tải tiết học" />;
  }

  if (!courseModule) {
    return (
      <section className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
        <p className="text-sm text-error">Không tìm thấy chuyên đề.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-sm text-primary underline"
        >
          Quay lại danh sách chuyên đề
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:p-5">
      <button
        type="button"
        onClick={() => void goBack()}
        className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Chuyên đề
      </button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{courseModule.title}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Bấm một tiết học để soạn. Kéo tay cầm để đổi thứ tự.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void createLesson()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover sm:min-h-10"
          >
            Thêm tiết học
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border-default p-4 text-sm text-text-secondary">
          Chuyên đề này chưa có tiết học. Thêm tiết lý thuyết hoặc tiết thực hành.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <SortableOrderList items={items} canReorder={canReorder} onReorder={applyDrag}>
            {(lesson) => {
              return (
                <SortableRow
                  id={lesson.id}
                  canReorder={canReorder}
                  rowLabel={`Mở tiết học ${lesson.title}`}
                  onRowClick={() => void openLesson(lesson)}
                  menu={
                    canEdit ? (
                      <RowActionsMenu
                        label={`Thao tác tiết học ${lesson.title}`}
                        actions={[
                          {
                            label: "Xoá",
                            variant: "danger",
                            onSelect: () => void requestDelete(lesson),
                          },
                        ]}
                      />
                    ) : null
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {lesson.title}
                      </p>
                      <span
                        className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${lessonKindBadgeClass(lesson.kind)}`}
                      >
                        {lessonKindLabel(lesson.kind)}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">{lessonMeta(lesson)}</p>
                  </div>
                  <svg
                    className="size-4 shrink-0 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </SortableRow>
              );
            }}
          </SortableOrderList>
          {canEdit ? (
            <OrderSaveBar
              dirty={orderDirty}
              saving={reorderMutation.isPending}
              onSave={() => {
                if (!orderDirty || reorderMutation.isPending) return;
                reorderMutation.mutate(items.map((row) => row.id));
              }}
              onDiscard={discard}
            />
          ) : null}
        </div>
      )}
      {dialog}
    </section>
  );
}
