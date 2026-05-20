"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import LessonOutputFormPopup from "@/components/admin/lesson-plans/LessonOutputFormPopup";
import LessonOutputQuickPopup from "@/components/admin/lesson-plans/LessonOutputQuickPopup";
import LessonResourceFormPopup from "@/components/admin/lesson-plans/LessonResourceFormPopup";
import { LessonTaskDetailSkeleton } from "@/components/admin/lesson-plans/LessonOverviewSkeleton";
import LessonTaskFormPopup from "@/components/admin/lesson-plans/LessonTaskFormPopup";
import {
  formatLessonDateOnly,
  formatLessonStaffRoleLabel,
  LESSON_OUTPUT_STATUS_LABELS,
  LESSON_TASK_PRIORITY_LABELS,
  LESSON_TASK_STATUS_LABELS,
  lessonOutputStatusChipClass,
  lessonTaskPriorityChipClass,
  lessonTaskStatusChipClass,
} from "@/components/admin/lesson-plans/lessonTaskUi";
import type {
  CreateLessonResourcePayload,
  CreateLessonOutputPayload,
  CreateLessonTaskPayload,
  LessonResourceOption,
  LessonTaskDetail,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";

function normalizePositiveInt(value: string | null, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeTab(value: string | null) {
  if (value === "work" || value === "exercises") {
    return value;
  }

  return "overview";
}

function getErrorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

export function LessonTaskDetailPage({
  workspaceBasePath = "/admin/lesson-plans",
  participantMode = false,
  allowDelete: allowDeleteProp,
}: {
  workspaceBasePath?: string;
  participantMode?: boolean;
  allowDelete?: boolean;
}) {
  const params = useParams();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const taskId = typeof params?.taskId === "string" ? params.taskId : "";
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const [createOutputOpen, setCreateOutputOpen] = useState(false);
  const [createResourceOpen, setCreateResourceOpen] = useState(false);
  const [editResourceOpen, setEditResourceOpen] = useState(false);
  const [attachResourceOpen, setAttachResourceOpen] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [resourceSearch, setResourceSearch] = useState("");
  const deferredResourceSearch = useDeferredValue(resourceSearch.trim());
  const canManageTask = !participantMode;
  const canDeleteInPage = allowDeleteProp ?? canManageTask;
  const canCreateResource = canManageTask || participantMode;
  const canOpenOutputPopup = canManageTask || participantMode;

  const backHref = useMemo(() => {
    const nextParams = new URLSearchParams();
    nextParams.set("tab", normalizeTab(getSearchParam("tab")));
    nextParams.set(
      "resourcePage",
      String(normalizePositiveInt(getSearchParam("resourcePage"))),
    );
    nextParams.set(
      "taskPage",
      String(normalizePositiveInt(getSearchParam("taskPage"))),
    );
    nextParams.set(
      "workPage",
      String(normalizePositiveInt(getSearchParam("workPage"))),
    );
    return `${workspaceBasePath}?${nextParams.toString()}`;
  }, [getSearchParam, workspaceBasePath]);

  const {
    data: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<LessonTaskDetail>({
    queryKey: ["lesson", "task", taskId],
    queryFn: () => lessonApi.getLessonTaskById(taskId),
    enabled: !!taskId,
  });

  const {
    data: resourceOptions = [],
    isFetching: isResourceOptionsFetching,
    isError: isResourceOptionsError,
  } = useQuery<LessonResourceOption[]>({
    queryKey: ["lesson", "resource-options", taskId, deferredResourceSearch],
    queryFn: () =>
      lessonApi.searchLessonResourceOptions({
        search: deferredResourceSearch || undefined,
        limit: 6,
        excludeTaskId: taskId,
      }),
    enabled: canManageTask && attachResourceOpen && !!taskId,
    placeholderData: keepPreviousData,
  });

  const resourceDetailQuery = useQuery({
    queryKey: ["lesson", "resource", selectedResourceId],
    queryFn: () => lessonApi.getLessonResourceById(selectedResourceId ?? ""),
    enabled: canManageTask && editResourceOpen && !!selectedResourceId,
  });

  const updateTaskMutation = useMutation({
    mutationFn: (payload: CreateLessonTaskPayload) =>
      lessonApi.updateLessonTask(taskId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lesson"] });
      toast.success("Đã cập nhật chi tiết công việc giáo án.");
      setEditPopupOpen(false);
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể cập nhật công việc."),
      );
    },
  });

  const createOutputMutation = useMutation({
    mutationFn: lessonApi.createLessonOutput,
    onSuccess: () => {
      toast.success("Đã tạo lesson output mới.");
      setCreateOutputOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["lesson"] });
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể tạo lesson output."),
      );
    },
  });

  const createResourceMutation = useMutation({
    mutationFn: lessonApi.createLessonResource,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "task", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "resource-options"] }),
      ]);
      toast.success("Đã thêm tài nguyên vào công việc.");
      setCreateResourceOpen(false);
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể thêm tài nguyên."),
      );
    },
  });

  const updateResourceMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateLessonResourcePayload;
    }) => lessonApi.updateLessonResource(id, payload),
    onSuccess: async (updatedResource) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "task", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "resource-options"] }),
        queryClient.invalidateQueries({
          queryKey: ["lesson", "resource", updatedResource.id],
        }),
      ]);
      toast.success("Đã cập nhật tài nguyên giáo án.");
      setEditResourceOpen(false);
      setSelectedResourceId(null);
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể cập nhật tài nguyên."),
      );
    },
  });

  const detachResourceMutation = useMutation({
    mutationFn: (resourceId: string) =>
      lessonApi.updateLessonResource(resourceId, {
        lessonTaskId: null,
      }),
    onSuccess: async (updatedResource) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "task", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "resource-options"] }),
        queryClient.invalidateQueries({
          queryKey: ["lesson", "resource", updatedResource.id],
        }),
      ]);

      if (selectedResourceId === updatedResource.id) {
        setEditResourceOpen(false);
        setSelectedResourceId(null);
      }

      toast.success("Đã gỡ tài nguyên khỏi công việc này.");
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể gỡ tài nguyên khỏi công việc."),
      );
    },
  });

  const attachExistingResourceMutation = useMutation({
    mutationFn: ({
      resourceId,
    }: {
      resourceId: string;
      previousTaskId: string | null;
    }) =>
      lessonApi.updateLessonResource(resourceId, {
        lessonTaskId: taskId,
      }),
    onSuccess: async (_updatedResource, variables) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "task", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "resource-options"] }),
      ];

      if (variables.previousTaskId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ["lesson", "task", variables.previousTaskId],
          }),
        );
      }

      await Promise.all(invalidations);
      toast.success(
        variables.previousTaskId
          ? "Đã chuyển tài nguyên có sẵn sang công việc này."
          : "Đã gắn tài nguyên có sẵn vào công việc.",
      );
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể đính kèm tài nguyên."),
      );
    },
  });

  const handleSubmit = async (payload: CreateLessonTaskPayload) => {
    await updateTaskMutation.mutateAsync(payload);
  };

  const handleCreateOutput = async (payload: CreateLessonOutputPayload) => {
    await createOutputMutation.mutateAsync(payload);
  };

  const handleCreateResource = async (payload: CreateLessonResourcePayload) => {
    await createResourceMutation.mutateAsync(payload);
  };

  const openOutputDetail = (outputId: string) => {
    setSelectedOutputId(outputId);
  };

  const handleAttachExistingResource = async (resource: LessonResourceOption) => {
    await attachExistingResourceMutation.mutateAsync({
      resourceId: resource.id,
      previousTaskId: resource.lessonTaskId,
    });
  };

  const openEditResource = (id: string) => {
    setSelectedResourceId(id);
    setEditResourceOpen(true);
  };

  const handleUpdateResource = async (payload: CreateLessonResourcePayload) => {
    if (!selectedResourceId) {
      toast.error("Không tìm thấy tài nguyên để cập nhật.");
      return;
    }

    await updateResourceMutation.mutateAsync({
      id: selectedResourceId,
      payload,
    });
  };

  const handleDetachResource = async (resourceId: string) => {
    await detachResourceMutation.mutateAsync(resourceId);
  };

  const resourceOptionsSummary = useMemo(() => {
    if (isResourceOptionsFetching) {
      return "Đang tải tài nguyên từ bảng LessonResources…";
    }

    if (isResourceOptionsError) {
      return "Không tải được danh sách tài nguyên từ database.";
    }

    if (resourceOptions.length === 0) {
      return deferredResourceSearch
        ? "Không tìm thấy tài nguyên khớp nội dung đang nhập."
        : "Hiển thị tối đa 6 tài nguyên gần nhất ngoài task hiện tại.";
    }

    return deferredResourceSearch
      ? `Có ${resourceOptions.length} tài nguyên khớp tìm kiếm.`
      : `Có ${resourceOptions.length} tài nguyên sẵn sàng để đính kèm.`;
  }, [
    deferredResourceSearch,
    isResourceOptionsError,
    isResourceOptionsFetching,
    resourceOptions.length,
  ]);

  if (!taskId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 sm:p-6">
        <div className="mx-auto w-full max-w-5xl rounded-[1.75rem] border border-border-default bg-bg-surface p-5 shadow-sm">
          <p className="text-base font-semibold text-text-primary">
            Không tìm thấy công việc giáo án.
          </p>
          <Link
            href={backHref}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Quay lại trang giáo án
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <svg
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Quay lại Giáo Án
          </Link>
        </div>

        {isLoading ? (
          <LessonTaskDetailSkeleton canManageTask={canManageTask} />
        ) : isError || !task ? (
          <section className="rounded-[1.75rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
            <div className="rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/40 px-5 py-12 text-center">
              <p className="text-base font-semibold text-text-primary">
                Không tải được chi tiết công việc.
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {getErrorMessage(error, "Đã có lỗi khi tải dữ liệu công việc.")}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Tải lại
                </button>
                <Link
                  href={backHref}
                  className="rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Trở về Giáo Án
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Main content */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {/* Hero / Header Card */}
                <section className="relative overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                          Chi tiết công việc giáo án
                        </p>
                        <h1 className="mt-2 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                          {task.title ?? "Công việc chưa đặt tên"}
                        </h1>
                      </div>
                      
                      {canManageTask ? (
                        <button
                          type="button"
                          onClick={() => setEditPopupOpen(true)}
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none shrink-0"
                        >
                          Chỉnh sửa công việc
                        </button>
                      ) : null}
                    </div>

                    {task.description?.trim() ? (
                      <div className="rounded-xl border border-border-default bg-bg-secondary/45 p-4">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                          {task.description}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm italic text-text-muted">
                        {participantMode
                          ? "Chưa có mô tả chi tiết."
                          : "Chưa có mô tả chi tiết — mở chỉnh sửa để bổ sung."}
                      </p>
                    )}
                  </div>
                </section>

                {/* Sản phẩm bài học (Outputs) */}
                <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-text-primary">
                        Sản phẩm bài học
                      </h2>
                      <p className="mt-1 text-xs text-text-muted">
                        {task.outputProgress.completed}/{task.outputProgress.total} hoàn thành
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateOutputOpen(true)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none"
                    >
                      Tạo sản phẩm
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {task.outputs.length > 0 ? (
                      task.outputs.map((output) => (
                        <button
                          key={output.id}
                          type="button"
                          onClick={() => openOutputDetail(output.id)}
                          className="group flex w-full cursor-pointer items-start justify-between gap-4 rounded-xl border border-border-default bg-bg-secondary/35 p-4 text-left transition-colors hover:bg-bg-secondary/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
                              {output.lessonName}
                            </h4>
                            <p className="mt-1 truncate text-xs text-text-secondary">
                              {output.contestUploaded ?? "Chưa ghi cuộc thi/đề"}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                              <span>Ngày: {formatLessonDateOnly(output.date)}</span>
                              {!participantMode && output.staffDisplayName && (
                                <span>Nhân sự: {output.staffDisplayName}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ring-1 ${lessonOutputStatusChipClass(output.status)}`}>
                              {LESSON_OUTPUT_STATUS_LABELS[output.status]}
                            </span>
                            <span className="text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                              Chi tiết →
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 py-8 text-center text-sm text-text-muted">
                        Chưa có sản phẩm bài học nào.
                      </div>
                    )}
                  </div>
                </section>

                {/* Tài nguyên liên quan */}
                <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-text-primary">
                        Tài nguyên liên quan
                      </h2>
                      <p className="mt-1 text-xs text-text-muted">
                        Tài nguyên, đề thi hoặc link tài liệu phục vụ cho giáo án.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canManageTask ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAttachResourceOpen((prev) => {
                              const next = !prev;
                              if (!next) setResourceSearch("");
                              return next;
                            });
                          }}
                          className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-xs font-semibold transition-colors focus:outline-none ${
                            attachResourceOpen
                              ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                              : "border-border-default bg-bg-surface text-text-primary hover:bg-bg-tertiary"
                          }`}
                        >
                          Đính kèm từ DB
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setCreateResourceOpen(true)}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none"
                      >
                        Thêm tài nguyên
                      </button>
                    </div>
                  </div>

                  {canManageTask && attachResourceOpen && (
                    <div className="mt-4 rounded-xl border border-border-default bg-bg-secondary/20 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
                        <h3 className="text-sm font-semibold text-text-primary">Đính kèm tài nguyên có sẵn</h3>
                        <span className="text-xs text-text-muted">{resourceOptionsSummary}</span>
                      </div>
                      <input
                        type="text"
                        value={resourceSearch}
                        onChange={(e) => setResourceSearch(e.target.value)}
                        placeholder="Tìm theo tiêu đề hoặc link tài nguyên…"
                        className="w-full min-h-10 rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      
                      <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {resourceOptions.length > 0 ? (
                          resourceOptions.map((resource) => {
                            const isPending = attachExistingResourceMutation.isPending && attachExistingResourceMutation.variables?.resourceId === resource.id;
                            const actionLabel = resource.lessonTaskId ? "Chuyển sang task này" : "Đính kèm vào task";
                            return (
                              <div key={resource.id} className="flex items-center justify-between gap-4 rounded-lg border border-border-default bg-bg-surface p-3 text-xs">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold text-text-primary">{resource.title || resource.resourceLink}</p>
                                  <p className="truncate text-text-muted mt-0.5">{resource.resourceLink}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleAttachExistingResource(resource)}
                                  disabled={attachExistingResourceMutation.isPending}
                                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 font-medium text-text-inverse hover:bg-primary-hover transition-colors disabled:opacity-50"
                                >
                                  {isPending ? "Đang đính kèm…" : actionLabel}
                                </button>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-text-muted italic text-center py-4">
                            {deferredResourceSearch ? "Không tìm thấy tài nguyên khớp." : "Không có gợi ý tài nguyên khác."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    {task.resourcePreview.length > 0 ? (
                      task.resourcePreview.map((resource) => (
                        <div key={resource.id} className="flex items-center justify-between gap-4 rounded-xl border border-border-default bg-bg-secondary/35 p-3.5 transition-colors hover:bg-bg-secondary/65">
                          <div className="min-w-0 flex-1">
                            {canManageTask ? (
                              <button
                                type="button"
                                onClick={() => openEditResource(resource.id)}
                                className="group w-full text-left focus:outline-none"
                              >
                                <p className="truncate text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
                                  {resource.title || resource.resourceLink}
                                </p>
                                <p className="mt-1 truncate text-xs text-primary group-hover:underline">
                                  {resource.resourceLink}
                                </p>
                              </button>
                            ) : (
                              <div>
                                <p className="truncate text-sm font-semibold text-text-primary">
                                  {resource.title || resource.resourceLink}
                                </p>
                                <a
                                  href={resource.resourceLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 block truncate text-xs text-primary hover:underline"
                                >
                                  {resource.resourceLink}
                                </a>
                              </div>
                            )}
                          </div>
                          {canManageTask && (
                            <button
                              type="button"
                              onClick={() => void handleDetachResource(resource.id)}
                              disabled={detachResourceMutation.isPending}
                              className="shrink-0 rounded-lg border border-warning/20 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
                            >
                              {detachResourceMutation.isPending && detachResourceMutation.variables === resource.id ? "Đang gỡ…" : "Gỡ"}
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 py-8 text-center text-sm text-text-muted">
                        Chưa có tài nguyên nào gắn với công việc này.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Right Column: Sidebar */}
              <div className="flex flex-col gap-6">
                {/* Meta Panel */}
                <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-text-muted mb-4">
                    Thông tin công việc
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-text-muted block">Hạn xử lý</span>
                      <span className="text-base font-semibold text-text-primary mt-1 block">
                        {formatLessonDateOnly(task.dueDate)}
                      </span>
                    </div>
                    <hr className="border-border-default" />
                    <div>
                      <span className="text-xs text-text-muted block">Độ ưu tiên</span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] mt-1 ring-1 ${lessonTaskPriorityChipClass(task.priority)}`}>
                        {LESSON_TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                    <hr className="border-border-default" />
                    <div>
                      <span className="text-xs text-text-muted block">Trạng thái</span>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] mt-1 ring-1 ${lessonTaskStatusChipClass(task.status)}`}>
                        {LESSON_TASK_STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Assignees Panel */}
                <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-text-muted">
                      Nhân sự thực hiện
                    </h3>
                    <span className="rounded-full bg-bg-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                      {task.assignees.length}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    {task.assignees.length > 0 ? (
                      task.assignees.map((assignee) => (
                        <article key={assignee.id} className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-secondary/25 p-3">
                          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                            {assignee.fullName.split(" ").pop()?.substring(0, 2).toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-text-primary leading-tight">
                              {assignee.fullName}
                            </p>
                            <p className="mt-1 truncate text-xs text-text-secondary">
                              {formatLessonStaffRoleLabel(assignee.roles)}
                            </p>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="text-xs text-text-muted italic py-2">
                        {participantMode
                          ? "Task này hiện chưa được gán nhân sự nào ngoài bạn."
                          : "Chưa có nhân sự thực hiện. Mở popup chỉnh sửa để gán nhân sự."}
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {task ? (
        <>
          {canManageTask ? (
            <LessonTaskFormPopup
              key={`task-detail-${task.id}-${editPopupOpen ? "open" : "closed"}`}
              open={editPopupOpen}
              mode="edit"
              initialData={task}
              isSubmitting={updateTaskMutation.isPending}
              onClose={() => {
                if (updateTaskMutation.isPending) return;
                setEditPopupOpen(false);
              }}
              onSubmit={handleSubmit}
            />
          ) : null}
          <LessonOutputFormPopup
            open={createOutputOpen}
            mode="create"
            task={{
              id: task.id,
              title: task.title,
            }}
            hideStaffFields={participantMode}
            forceSharedLayout={participantMode}
            allowTasklessOutput={false}
            allowPaymentStatusEdit={!participantMode}
            isSubmitting={createOutputMutation.isPending}
            onClose={() => {
              if (createOutputMutation.isPending) return;
              setCreateOutputOpen(false);
            }}
            onSubmit={handleCreateOutput}
          />
          {canCreateResource ? (
            <LessonResourceFormPopup
              open={createResourceOpen}
              mode="create"
              linkedTask={{
                id: task.id,
                title: task.title,
              }}
              isSubmitting={createResourceMutation.isPending}
              onClose={() => {
                if (createResourceMutation.isPending) return;
                setCreateResourceOpen(false);
              }}
              onSubmit={handleCreateResource}
            />
          ) : null}
          {canOpenOutputPopup ? (
            <LessonOutputQuickPopup
              open={Boolean(selectedOutputId)}
              outputId={selectedOutputId}
              showParentTaskBanner={!participantMode}
              hideStaffFields={participantMode}
              showStaffSummary={!participantMode}
              forceSharedLayout={participantMode}
              allowTasklessOutput={false}
              allowDelete={canDeleteInPage}
              allowPaymentStatusEdit={!participantMode}
              allowCostEdit={!participantMode}
              relatedTaskIds={[task.id]}
              onClose={() => setSelectedOutputId(null)}
            />
          ) : null}
          {canManageTask ? (
            <>
              <LessonResourceFormPopup
                key={`task-resource-edit-${selectedResourceId ?? "empty"}-${resourceDetailQuery.data?.updatedAt ?? "loading"}`}
                open={editResourceOpen}
                mode="edit"
                initialData={resourceDetailQuery.data ?? null}
                isSubmitting={updateResourceMutation.isPending}
                isLoading={
                  editResourceOpen &&
                  (resourceDetailQuery.isLoading || resourceDetailQuery.isFetching)
                }
                isError={resourceDetailQuery.isError}
                errorMessage={getErrorMessage(
                  resourceDetailQuery.error,
                  "Không tải được tài nguyên.",
                )}
                onRetry={() => void resourceDetailQuery.refetch()}
                onClose={() => {
                  if (updateResourceMutation.isPending) return;
                  setEditResourceOpen(false);
                  setSelectedResourceId(null);
                }}
                onSubmit={handleUpdateResource}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function AdminLessonTaskDetailPage() {
  return <LessonTaskDetailPage />;
}
