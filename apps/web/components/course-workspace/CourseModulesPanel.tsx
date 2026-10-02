"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { courseKeys } from "@/lib/query-keys";
import { invalidateCoursePracticeLessonQueries } from "@/lib/query-invalidation";
import { CourseContentListSkeleton } from "@/components/course-workspace/CourseWorkspaceSkeletons";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import {
  confirmOrderDirtyLeave,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import type { CourseModule } from "@/dtos/course-content.dto";
import { RowActionsMenu } from "@/components/course-workspace/RowActionsMenu";
import {
  OrderSaveBar,
  SortableOrderList,
  SortableRow,
  useOrderDraft,
} from "@/components/course-workspace/SortableOrderList";

export function CourseModulesPanel({
  courseId,
  canEdit,
  onOpenModule,
  onOrderDirtyChange,
}: {
  courseId: string;
  canEdit: boolean;
  onOpenModule: (moduleId: string) => void;
  onOrderDirtyChange?: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const [newTitle, setNewTitle] = useState("");
  const [renameTarget, setRenameTarget] = useState<CourseModule | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const { data: modules = [], isLoading } = useQuery({
    queryKey: courseKeys.modules(courseId),
    queryFn: () => classApi.getModules(courseId),
    enabled: Boolean(courseId),
  });

  const { items, orderDirty, applyDrag, discard } = useOrderDraft(
    modules,
    courseId,
  );

  useEffect(() => {
    onOrderDirtyChange?.(orderDirty);
    return () => onOrderDirtyChange?.(false);
  }, [orderDirty, onOrderDirtyChange]);

  const invalidate = () => invalidateCoursePracticeLessonQueries(queryClient, courseId);

  const createMutation = useMutation({
    mutationFn: (title: string) => classApi.createModule(courseId, { title }),
    onSuccess: () => {
      toast.success("Đã thêm chuyên đề.");
      setNewTitle("");
      discard();
      void invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể thêm chuyên đề.");
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      classApi.updateModule(courseId, id, { title }),
    onSuccess: () => {
      toast.success("Đã đổi tên chuyên đề.");
      setRenameTarget(null);
      void invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể cập nhật chuyên đề.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => classApi.deleteModule(courseId, id),
    onSuccess: () => {
      toast.success("Đã xoá chuyên đề.");
      discard();
      void invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể xoá chuyên đề.");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (moduleIds: string[]) =>
      classApi.reorderModules(courseId, moduleIds),
    onSuccess: () => {
      toast.success("Đã lưu thứ tự chuyên đề.");
      discard();
      void invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể sắp xếp chuyên đề.");
    },
  });

  const addModule = () => {
    const title = newTitle.trim();
    if (!title || createMutation.isPending) return;
    createMutation.mutate(title);
  };

  const openModule = async (moduleId: string) => {
    if (!(await confirmOrderDirtyLeave(confirm, orderDirty))) return;
    discard();
    onOpenModule(moduleId);
  };

  const requestDelete = async (courseModule: CourseModule) => {
    const ok = await confirm({
      title: "Xoá chuyên đề?",
      description: `Xoá chuyên đề "${courseModule.title}" và mọi tiết học bên trong? Không xoá được nếu lớp đang dùng nội dung này.`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    deleteMutation.mutate(courseModule.id);
  };

  const canReorder = canEdit && items.length > 1;

  if (isLoading) {
    return <CourseContentListSkeleton label="Đang tải chuyên đề" />;
  }

  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">Chuyên đề</h2>
      <p className="mt-0.5 text-sm text-text-secondary">
        Mỗi chuyên đề chứa các tiết lý thuyết và tiết thực hành. Bấm một dòng để mở danh sách tiết học.
      </p>

      {canEdit ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addModule();
              }
            }}
            aria-label="Tên chuyên đề mới"
            placeholder="Tên chuyên đề mới..."
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-10"
          />
          <button
            type="button"
            onClick={addModule}
            disabled={!newTitle.trim() || createMutation.isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60 sm:min-h-10"
          >
            Thêm chuyên đề
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border-default p-4 text-sm text-text-secondary">
          Chưa có chuyên đề nào. Thêm chuyên đề đầu tiên để bắt đầu soạn nội dung.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <SortableOrderList items={items} canReorder={canReorder} onReorder={applyDrag}>
            {(courseModule) => (
              <SortableRow
                id={courseModule.id}
                canReorder={canReorder}
                rowLabel={`Mở tiết học của ${courseModule.title}`}
                onRowClick={() => void openModule(courseModule.id)}
                menu={
                  canEdit ? (
                    <RowActionsMenu
                      label={`Thao tác chuyên đề ${courseModule.title}`}
                      actions={[
                        {
                          label: "Đổi tên",
                          onSelect: () => {
                            setRenameTarget(courseModule);
                            setRenameTitle(courseModule.title);
                          },
                        },
                        {
                          label: "Xoá",
                          variant: "danger",
                          onSelect: () => void requestDelete(courseModule),
                        },
                      ]}
                    />
                  ) : null
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {courseModule.title}
                  </p>
                  <p className="text-xs text-text-muted">
                    {courseModule.lessonCount ?? 0} tiết học
                  </p>
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
            )}
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

      {renameTarget ? (
        <ResponsiveDialog
          labelledBy="rename-module-title"
          onBackdropClick={() => setRenameTarget(null)}
          size="sm"
        >
          <div className="border-b border-border-default px-4 py-3">
            <h3 id="rename-module-title" className="text-base font-semibold text-text-primary">
              Đổi tên chuyên đề
            </h3>
          </div>
          <ResponsiveDialogBody>
            <input
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const title = renameTitle.trim();
                  if (title) renameMutation.mutate({ id: renameTarget.id, title });
                }
              }}
              className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="rounded-md border border-border-default px-3 py-2 text-sm font-medium text-text-secondary"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => {
                const title = renameTitle.trim();
                if (title) renameMutation.mutate({ id: renameTarget.id, title });
              }}
              disabled={!renameTitle.trim() || renameMutation.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-text-inverse disabled:opacity-60"
            >
              Lưu
            </button>
          </ResponsiveActionFooter>
        </ResponsiveDialog>
      ) : null}
      {dialog}
    </section>
  );
}
