"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CreateLessonResourcePayload,
  CreateLessonTaskPayload,
  LessonListMeta,
  LessonOverviewResponse,
  LessonResourceItem,
  LessonTabId,
  LessonTaskItem,
  LessonUpsertMode,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import type { StaffLessonEndpointAccessMode } from "@/lib/staff-lesson-workspace";
import LessonDeleteConfirmPopup from "./LessonDeleteConfirmPopup";
import LessonOverviewSkeleton, {
  LessonOverviewTableSkeleton,
} from "./LessonOverviewSkeleton";
import LessonResourceFormPopup from "./LessonResourceFormPopup";
import LessonTaskFormPopup from "./LessonTaskFormPopup";
import LessonExercisesTab from "./LessonExercisesTab";
import LessonWorkTab from "./LessonWorkTab";
import {
  formatLessonDateOnly,
  LESSON_TASK_PRIORITY_LABELS,
  LESSON_TASK_STATUS_LABELS,
  lessonTaskPriorityChipClass,
  lessonTaskStatusChipClass,
} from "./lessonTaskUi";

const TAB_LABELS: Record<LessonTabId, string> = {
  overview: "Tổng quan",
  work: "Công việc",
  exercises: "Giáo Án",
};
const TAB_INDICATOR_TRANSITION: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};
const TAB_PANEL_TRANSITION: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

const RESOURCE_PAGE_SIZE = 6;
const TASK_PAGE_SIZE = 6;

type DeleteTarget =
  | { kind: "resource"; id: string; label: string }
  | { kind: "task"; id: string; label: string }
  | null;

function normalizeTab(value: string | null): LessonTabId {
  if (value === "overview" || value === "work" || value === "exercises") {
    return value;
  }

  return "overview";
}

function normalizePositiveInt(value: string | null, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function isNestedInteractiveElement(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest("a, button, input, textarea, select, summary"),
    )
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function formatTaskAssigneeSummary(assignees: LessonTaskItem["assignees"]) {
  if (assignees.length === 0) {
    return "Chưa ghi nhận";
  }

  const visibleNames = assignees
    .slice(0, 2)
    .map((assignee) => assignee.fullName)
    .join(", ");
  const remainingCount = assignees.length - 2;

  return remainingCount > 0
    ? `${visibleNames} +${remainingCount}`
    : visibleNames;
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/40 px-5 py-10 text-center">
      <p className="text-base font-semibold text-text-primary">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
        {description}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:w-auto"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function OverviewActionButton({
  label,
  onClick,
  tone = "neutral",
  icon,
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border p-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${tone === "danger"
        ? "border-error/20 bg-error/6 text-error hover:bg-error/12"
        : "border-border-default bg-bg-surface text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
        }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function OverviewMetaBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-default/70 bg-bg-secondary/35 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
      <div className="mt-2 min-w-0">{children}</div>
    </div>
  );
}

function TablePagination({
  label,
  meta,
  isPending = false,
  onPageChange,
}: {
  label: string;
  meta: LessonListMeta;
  isPending?: boolean;
  onPageChange: (page: number) => void;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to =
    meta.total === 0 ? 0 : Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-secondary">
          {label}: {from}-{to} / {meta.total}
        </p>
        {isPending ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Đang chuyển trang
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
        <button
          type="button"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={meta.page <= 1 || isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trước
        </button>
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-center text-sm font-medium text-text-secondary">
          Trang {meta.page}/{meta.totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={meta.page >= meta.totalPages || isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  );
}

function ListTableSkeleton({
  rows = 6,
  variant,
}: {
  rows?: number;
  variant: "resource" | "task";
}) {
  return <LessonOverviewTableSkeleton rows={rows} variant={variant} />;
}

export type WorkspacePolicy = "admin" | "lesson_plan_head" | "lesson_plan" | "accountant";

const POLICY_VISIBLE_TABS: Record<WorkspacePolicy, LessonTabId[]> = {
  admin: ["overview", "work", "exercises"],
  lesson_plan_head: ["overview", "work", "exercises"],
  lesson_plan: ["overview", "work"],
  accountant: ["work"],
};

const WORKSPACE_POLICY_COPY: Record<
  WorkspacePolicy,
  {
    badge: string;
    description: string;
  }
> = {
  admin: {
    badge: "Toàn quyền",
    description:
      "Điều phối toàn bộ thư viện, task và lesson output trong một workspace thống nhất.",
  },
  lesson_plan_head: {
    badge: "Trưởng giáo án",
    description:
      "Theo dõi tổng quan, xử lý công việc và quản lý kho giáo án trong staff shell.",
  },
  lesson_plan: {
    badge: "Giáo án cá nhân",
    description:
      "Xem đúng task được giao trong tab Tổng quan và chỉ thao tác lesson output của chính bạn ở tab Công việc.",
  },
  accountant: {
    badge: "Kế toán",
    description:
      "Chỉ tập trung vào tab Công việc để rà soát toàn bộ lesson output và trạng thái thanh toán.",
  },
};

export default function AdminLessonPlansWorkspace({
  basePath = "/admin/lesson-plans",
  manageDetailsPath = "/admin/lesson-manage-details",
  taskDetailBasePath = "/admin/lesson-plans/tasks",
  participantMode = false,
  workspacePolicy = "admin",
  workAccessMode,
  createOutputAccessMode,
}: {
  basePath?: string;
  manageDetailsPath?: string;
  taskDetailBasePath?: string;
  participantMode?: boolean;
  workspacePolicy?: WorkspacePolicy;
  workAccessMode?: StaffLessonEndpointAccessMode;
  createOutputAccessMode?: Exclude<StaffLessonEndpointAccessMode, "account"> | null;
}) {
  const pathname = usePathname();
  const { push, replace } = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const activeTab = normalizeTab(getSearchParam("tab"));
  const resourcePage = normalizePositiveInt(getSearchParam("resourcePage"));
  const taskPage = normalizePositiveInt(getSearchParam("taskPage"));

  const [resourcePopupOpen, setResourcePopupOpen] = useState(false);
  const [resourceMode, setResourceMode] = useState<LessonUpsertMode>("create");
  const [selectedResource, setSelectedResource] =
    useState<LessonResourceItem | null>(null);

  const [taskPopupOpen, setTaskPopupOpen] = useState(false);
  const [taskMode, setTaskMode] = useState<LessonUpsertMode>("create");
  const [selectedTask, setSelectedTask] = useState<LessonTaskItem | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const canManageWorkspace = !participantMode && workspacePolicy !== "accountant";
  const canCreate = workspacePolicy === "admin" || workspacePolicy === "lesson_plan_head" || (participantMode && workspacePolicy !== "accountant");
  const canDelete = workspacePolicy === "admin";
  const visibleTabs = POLICY_VISIBLE_TABS[workspacePolicy];
  const resolvedActiveTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];
  const [activeTabState, setActiveTabState] = useState<LessonTabId>(resolvedActiveTab);
  const workspaceCopy = WORKSPACE_POLICY_COPY[workspacePolicy];
  const shouldLoadOverview = activeTabState === "overview";
  const resolvedWorkAccessMode =
    workAccessMode ??
    (participantMode
      ? "participant"
      : workspacePolicy === "accountant"
        ? "account"
        : "manage");
  const resolvedCreateOutputAccessMode =
    createOutputAccessMode ??
    (workspacePolicy === "accountant"
      ? null
      : participantMode
        ? "participant"
        : "manage");

  const { data, isLoading, isFetching, isError, error, refetch } =
    useQuery<LessonOverviewResponse>({
      queryKey: ["lesson", "overview", workspacePolicy, resourcePage, taskPage],
      queryFn: () =>
        lessonApi.getLessonOverview({
          resourcePage,
          resourceLimit: RESOURCE_PAGE_SIZE,
          taskPage,
          taskLimit: TASK_PAGE_SIZE,
        }),
      enabled: shouldLoadOverview,
      placeholderData: (previousData) => previousData,
    });

  const resources = useMemo(() => data?.resources ?? [], [data]);
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const isResourceListPending =
    !!data && isFetching && data.resourcesMeta.page !== resourcePage;
  const isTaskListPending = !!data && isFetching && data.tasksMeta.page !== taskPage;

  const invalidateOverview = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] });
  };

  const createResourceMutation = useMutation({
    mutationFn: lessonApi.createLessonResource,
    onSuccess: async () => {
      await invalidateOverview();
      toast.success("Đã thêm tài nguyên giáo án.");
      setResourcePopupOpen(false);
      setSelectedResource(null);
      setResourceMode("create");
    },
    onError: (mutationError) => {
      toast.error(getErrorMessage(mutationError, "Không thể tạo tài nguyên."));
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
    onSuccess: async () => {
      await invalidateOverview();
      toast.success("Đã cập nhật tài nguyên giáo án.");
      setResourcePopupOpen(false);
      setSelectedResource(null);
      setResourceMode("create");
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể cập nhật tài nguyên."),
      );
    },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: lessonApi.deleteLessonResource,
    onSuccess: async () => {
      await invalidateOverview();
      toast.success("Đã xóa tài nguyên giáo án.");
      setDeleteTarget(null);
    },
    onError: (mutationError) => {
      toast.error(getErrorMessage(mutationError, "Không thể xóa tài nguyên."));
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: lessonApi.createLessonTask,
    onSuccess: async () => {
      await invalidateOverview();
      toast.success("Đã thêm công việc giáo án.");
      setTaskPopupOpen(false);
      setSelectedTask(null);
      setTaskMode("create");
    },
    onError: (mutationError) => {
      toast.error(getErrorMessage(mutationError, "Không thể tạo công việc."));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateLessonTaskPayload;
    }) => lessonApi.updateLessonTask(id, payload),
    onSuccess: async () => {
      await invalidateOverview();
      toast.success("Đã cập nhật công việc giáo án.");
      setTaskPopupOpen(false);
      setSelectedTask(null);
      setTaskMode("create");
    },
    onError: (mutationError) => {
      toast.error(
        getErrorMessage(mutationError, "Không thể cập nhật công việc."),
      );
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: lessonApi.deleteLessonTask,
    onSuccess: async () => {
      await invalidateOverview();
      toast.success("Đã xóa công việc giáo án.");
      setDeleteTarget(null);
    },
    onError: (mutationError) => {
      toast.error(getErrorMessage(mutationError, "Không thể xóa công việc."));
    },
  });

  const syncTabToUrl = useCallback(
    (tab: LessonTabId) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", tab);
      const nextQuery = params.toString();
      replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParams],
  );

  useEffect(() => {
    if (resolvedActiveTab === activeTab) {
      return;
    }

    syncTabToUrl(resolvedActiveTab);
  }, [activeTab, resolvedActiveTab, syncTabToUrl]);

  useEffect(() => {
    setActiveTabState(resolvedActiveTab);
  }, [resolvedActiveTab]);

  const setListPage = (key: "resourcePage" | "taskPage", page: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set(key, String(Math.max(1, page)));
    params.set("tab", activeTabState);
    const nextQuery = params.toString();
    replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

  const buildTaskDetailHref = (taskId: string) => {
    const params = new URLSearchParams();
    params.set("tab", activeTabState);
    params.set("resourcePage", String(resourcePage));
    params.set("taskPage", String(taskPage));
    return `${taskDetailBasePath}/${encodeURIComponent(taskId)}?${params.toString()}`;
  };

  const openCreateResource = () => {
    setResourceMode("create");
    setSelectedResource(null);
    setResourcePopupOpen(true);
  };

  const openEditResource = (resource: LessonResourceItem) => {
    setResourceMode("edit");
    setSelectedResource(resource);
    setResourcePopupOpen(true);
  };

  const handleResourceItemActivate = (
    resource: LessonResourceItem,
    target: EventTarget | null,
  ) => {
    if (!canManageWorkspace || isNestedInteractiveElement(target)) {
      return;
    }

    openEditResource(resource);
  };

  const openCreateTask = () => {
    setTaskMode("create");
    setSelectedTask(null);
    setTaskPopupOpen(true);
  };

  const openEditTask = (task: LessonTaskItem) => {
    setTaskMode("edit");
    setSelectedTask(task);
    setTaskPopupOpen(true);
  };

  const handleResourceSubmit = async (payload: CreateLessonResourcePayload) => {
    if (resourceMode === "create") {
      await createResourceMutation.mutateAsync(payload);
      return;
    }

    if (!selectedResource) {
      toast.error("Không tìm thấy tài nguyên để cập nhật.");
      return;
    }

    await updateResourceMutation.mutateAsync({
      id: selectedResource.id,
      payload,
    });
  };

  const handleTaskSubmit = async (payload: CreateLessonTaskPayload) => {
    if (taskMode === "create") {
      await createTaskMutation.mutateAsync(payload);
      return;
    }

    if (!selectedTask) {
      toast.error("Không tìm thấy công việc để cập nhật.");
      return;
    }

    await updateTaskMutation.mutateAsync({
      id: selectedTask.id,
      payload,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.kind === "resource") {
      await deleteResourceMutation.mutateAsync(deleteTarget.id);
      return;
    }

    await deleteTaskMutation.mutateAsync(deleteTarget.id);
  };

  const isDeletePending =
    deleteResourceMutation.isPending || deleteTaskMutation.isPending;
  const indicatorTransition = prefersReducedMotion
    ? { duration: 0 }
    : TAB_INDICATOR_TRANSITION;
  const panelMotionProps = prefersReducedMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: TAB_PANEL_TRANSITION,
      };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        {/* Header gộp: tiêu đề + thanh tab trong cùng một cụm phẳng tối giản */}
        <header className="relative mb-6 min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
                  Giáo Án
                </h1>
                <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {workspaceCopy.badge}
                </span>
              </div>
              <p className="mt-1.5 max-w-3xl text-sm text-text-muted leading-relaxed">
                {workspaceCopy.description}
              </p>
            </div>
          </div>

          <div
            className="mt-6 flex w-full min-w-0 gap-6 border-b border-border-default/80"
            role="tablist"
            aria-label="Tổng quan, Công việc hoặc Giáo án"
          >
            {(Object.keys(TAB_LABELS) as LessonTabId[]).filter((t) => visibleTabs.includes(t)).map((tabId) => {
              const isActive = activeTabState === tabId;
              return (
                <button
                  key={tabId}
                  id={`lesson-tab-${tabId}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`lesson-panel-${tabId}`}
                  onClick={async () => {
                    setActiveTabState(tabId);
                    await Promise.resolve();
                    syncTabToUrl(tabId);
                  }}
                  className={`relative pb-3 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:text-base ${isActive
                    ? "text-primary"
                    : "text-text-muted hover:text-text-primary"
                    }`}
                >
                  <span className="relative z-10">{TAB_LABELS[tabId]}</span>
                  {isActive ? (
                    <motion.span
                      layoutId="lesson-plans-tab-underline"
                      aria-hidden
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary"
                      transition={indicatorTransition}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </header>

        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {activeTabState === "overview" ? (
            <motion.section
              key="overview"
              id="lesson-panel-overview"
              role="tabpanel"
              aria-labelledby="lesson-tab-overview"
              className="space-y-6"
              {...panelMotionProps}
            >
              {isLoading && !data ? (
                <LessonOverviewSkeleton />
              ) : isError ? (
                <section className="rounded-[1.75rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
                  <div className="rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/40 px-5 py-12 text-center">
                    <p className="text-base font-semibold text-text-primary">
                      Không tải được dữ liệu giáo án.
                    </p>
                    <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                      {getErrorMessage(error, "Đã có lỗi khi tải tab Tổng quan.")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void refetch()}
                      className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Tải lại
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  <section
                    className="py-1"
                    aria-busy={isResourceListPending}
                  >
                    <div className="flex flex-col gap-4 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-text-primary sm:text-xl">
                          Tài nguyên giáo án
                        </h2>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border-default bg-bg-secondary px-3 py-1 text-xs font-medium text-text-secondary">
                            {data?.resourcesMeta.total ?? resources.length} tài
                            nguyên
                          </span>
                          {isResourceListPending ? (
                            <span className="rounded-full border border-border-default bg-bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
                              Đang đổi trang
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={openCreateResource}
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:w-auto"
                        >
                          Thêm tài nguyên
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      {isResourceListPending ? (
                        <ListTableSkeleton variant="resource" />
                      ) : resources.length === 0 ? (
                        <EmptyState
                          title="Chưa có tài nguyên nào trong tab Tổng quan"
                          description="Thêm tài liệu gốc, link lecture note, bộ đề, hoặc tài nguyên định hướng để team có một thư viện chung ngay tại route giáo án."
                          actionLabel="Tạo tài nguyên đầu tiên"
                          onAction={openCreateResource}
                        />
                      ) : (
                        <div className="overflow-hidden rounded-[1.4rem] border border-border-default">
                          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-1 xl:hidden">
                            {resources.map((resource) => (
                              <article
                                key={resource.id}
                                role={canManageWorkspace ? "button" : undefined}
                                tabIndex={canManageWorkspace ? 0 : undefined}
                                className={`rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm transition-colors ${canManageWorkspace
                                  ? "cursor-pointer hover:bg-bg-secondary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                                  : ""
                                  }`}
                                onClick={(event) =>
                                  handleResourceItemActivate(
                                    resource,
                                    event.target,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (
                                    !canManageWorkspace ||
                                    isNestedInteractiveElement(event.target)
                                  ) {
                                    return;
                                  }

                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    openEditResource(resource);
                                  }
                                }}
                                aria-label={
                                  canManageWorkspace
                                    ? `Mở popup chỉnh sửa tài nguyên ${resource.title?.trim() || "tài nguyên chưa đặt tên"}`
                                    : undefined
                                }
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                                      Tài nguyên
                                    </p>
                                    <p className="mt-1 break-words text-base font-semibold leading-6 text-text-primary">
                                      {resource.title ??
                                        "Tài nguyên chưa đặt tên"}
                                    </p>
                                    <p className="mt-2 text-xs leading-5 text-text-muted">
                                      Cập nhật{" "}
                                      {formatLessonDateOnly(resource.updatedAt)}
                                    </p>
                                  </div>

                                  {canManageWorkspace ? (
                                    <div className="flex shrink-0 items-center gap-2">
                                      <OverviewActionButton
                                        label={`Sửa tài nguyên ${resource.title?.trim() || ""}`}
                                        onClick={() => openEditResource(resource)}
                                        icon={
                                          <svg
                                            className="size-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                            />
                                          </svg>
                                        }
                                      />
                                      {canDelete ? (
                                      <OverviewActionButton
                                        label={`Xóa tài nguyên ${resource.title?.trim() || ""}`}
                                        tone="danger"
                                        onClick={() =>
                                          setDeleteTarget({
                                            kind: "resource",
                                            id: resource.id,
                                            label:
                                              resource.title ??
                                              "tài nguyên chưa đặt tên",
                                          })
                                        }
                                        icon={
                                          <svg
                                            className="size-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                          </svg>
                                        }
                                      />
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="mt-4 grid gap-3">
                                  <OverviewMetaBlock label="Link">
                                    <a
                                      href={resource.resourceLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      className="inline-flex max-w-full items-center gap-2 break-all text-sm text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                    >
                                      {resource.resourceLink}
                                    </a>
                                  </OverviewMetaBlock>

                                  <OverviewMetaBlock label="Tag">
                                    <div className="flex flex-wrap gap-2">
                                      {resource.tags.length > 0 ? (
                                        resource.tags.map((tag) => (
                                          <span
                                            key={`${resource.id}-${tag}`}
                                            className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary"
                                          >
                                            {tag}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-sm text-text-muted">
                                          -
                                        </span>
                                      )}
                                    </div>
                                  </OverviewMetaBlock>
                                </div>
                              </article>
                            ))}
                          </div>

                          <div className="hidden overflow-x-auto xl:block">
                            <table className="min-w-full border-collapse text-left">
                              <thead className="bg-bg-secondary">
                                <tr className="text-sm text-text-secondary">
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Tài nguyên
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Link
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Tag
                                  </th>
                                  <th
                                    scope="col"
                                    className="w-20 px-4 py-3 text-right"
                                  >
                                    <span className="sr-only">Thao tác</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {resources.map((resource) => (
                                  <tr
                                    key={resource.id}
                                    role={canManageWorkspace ? "button" : undefined}
                                    tabIndex={canManageWorkspace ? 0 : undefined}
                                    className={`group border-t border-border-default bg-bg-surface align-top transition-colors ${canManageWorkspace
                                      ? "cursor-pointer hover:bg-bg-secondary/50 focus-within:bg-bg-secondary/50 focus:outline-none focus-visible:bg-bg-secondary/50"
                                      : ""
                                      }`}
                                    onClick={(event) =>
                                      handleResourceItemActivate(
                                        resource,
                                        event.target,
                                      )
                                    }
                                    onKeyDown={(event) => {
                                      if (
                                        !canManageWorkspace ||
                                        isNestedInteractiveElement(event.target)
                                      ) {
                                        return;
                                      }

                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        openEditResource(resource);
                                      }
                                    }}
                                    aria-label={
                                      canManageWorkspace
                                        ? `Mở popup chỉnh sửa tài nguyên ${resource.title?.trim() || "tài nguyên chưa đặt tên"}`
                                        : undefined
                                    }
                                  >
                                    <td className="px-4 py-4">
                                      <div className="min-w-[12rem]">
                                        <p className="font-medium text-text-primary">
                                          {resource.title ??
                                            "Tài nguyên chưa đặt tên"}
                                        </p>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4">
                                      <a
                                        href={resource.resourceLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        className="inline-flex max-w-[18rem] items-center gap-2 text-sm text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                      >
                                        <span className="truncate">
                                          {resource.resourceLink}
                                        </span>
                                      </a>
                                    </td>
                                    <td className="px-4 py-4">
                                      <div className="flex min-w-[10rem] flex-wrap gap-2">
                                        {resource.tags.length > 0 ? (
                                          resource.tags.map((tag) => (
                                            <span
                                              key={tag}
                                              className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary"
                                            >
                                              {tag}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-sm text-text-muted">
                                            -
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-4">
                                      {canManageWorkspace ? (
                                        <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openEditResource(resource)
                                            }
                                            className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-primary/12 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                                            aria-label={`Sửa tài nguyên ${resource.title?.trim() || ""}`}
                                            title="Sửa tài nguyên"
                                          >
                                            <svg
                                              className="size-4"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                              aria-hidden
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                              />
                                            </svg>
                                          </button>
                                          {canDelete ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setDeleteTarget({
                                                kind: "resource",
                                                id: resource.id,
                                                label:
                                                  resource.title ??
                                                  "tài nguyên chưa đặt tên",
                                              })
                                            }
                                            className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                                            aria-label={`Xóa tài nguyên ${resource.title?.trim() || ""}`}
                                            title="Xóa tài nguyên"
                                          >
                                            <svg
                                              className="size-4"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                              aria-hidden
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                              />
                                            </svg>
                                          </button>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="px-4 py-4">
                            <TablePagination
                              label="Tài nguyên"
                              isPending={isResourceListPending}
                              meta={
                                data?.resourcesMeta ?? {
                                  total: resources.length,
                                  page: 1,
                                  limit: RESOURCE_PAGE_SIZE,
                                  totalPages: 1,
                                }
                              }
                              onPageChange={(page) =>
                                setListPage("resourcePage", page)
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <hr className="border-border-default/60 my-6" />

                  <section
                    className="py-1"
                    aria-busy={isTaskListPending}
                  >
                    <div className="flex flex-col gap-4 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-text-primary sm:text-xl">
                          Công việc giáo án
                        </h2>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border-default bg-bg-secondary px-3 py-1 text-xs font-medium text-text-secondary">
                            {data?.tasksMeta.total ?? tasks.length} công việc
                          </span>
                          {isTaskListPending ? (
                            <span className="rounded-full border border-border-default bg-bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
                              Đang đổi trang
                            </span>
                          ) : null}
                        </div>
                        {canManageWorkspace ? (
                          <button
                            type="button"
                            onClick={openCreateTask}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:w-auto"
                          >
                            Thêm công việc
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      {isTaskListPending ? (
                        <ListTableSkeleton variant="task" />
                      ) : tasks.length === 0 ? (
                        canManageWorkspace ? (
                          <EmptyState
                            title="Chưa có công việc nào trong tab Tổng quan"
                            description="Tạo task ngay tại đây để chốt backlog soạn bài, biên tập tài nguyên, hoặc các checklist cần xử lý cho route giáo án."
                            actionLabel="Tạo công việc đầu tiên"
                            onAction={openCreateTask}
                          />
                        ) : (
                          <div className="rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/40 px-5 py-10 text-center">
                            <p className="text-base font-semibold text-text-primary">
                              Chưa có công việc nào được giao cho bạn
                            </p>
                            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                              Danh sách này chỉ hiển thị các task mà backend xác
                              nhận bạn đang tham gia.
                            </p>
                          </div>
                        )
                      ) : (
                        <div className="overflow-hidden rounded-[1.4rem] border border-border-default">
                          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-1 xl:hidden">
                            {tasks.map((task) => (
                              <article
                                key={task.id}
                                className="rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm"
                              >
                                <div className="flex items-start gap-3">
                                  <Link
                                    href={buildTaskDetailHref(task.id)}
                                    className="min-w-0 flex-1 rounded-[1.2rem] transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                    aria-label={`Xem chi tiết công việc ${task.title?.trim() || ""}`}
                                  >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                                      Công việc
                                    </p>
                                    <p className="mt-1 break-words text-base font-semibold leading-6 text-text-primary">
                                      {task.title ?? "Công việc chưa đặt tên"}
                                    </p>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskStatusChipClass(
                                          task.status,
                                        )}`}
                                      >
                                        {LESSON_TASK_STATUS_LABELS[task.status]}
                                      </span>
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskPriorityChipClass(
                                          task.priority,
                                        )}`}
                                      >
                                        {LESSON_TASK_PRIORITY_LABELS[task.priority]}
                                      </span>
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                      <OverviewMetaBlock label="Hạn xử lý">
                                        <p className="text-sm font-medium text-text-primary">
                                          {formatLessonDateOnly(task.dueDate)}
                                        </p>
                                      </OverviewMetaBlock>

                                      <OverviewMetaBlock label="Nhân sự thực hiện">
                                        <p className="text-sm font-medium text-text-primary">
                                          {formatTaskAssigneeSummary(task.assignees)}
                                        </p>
                                      </OverviewMetaBlock>
                                    </div>
                                  </Link>

                                  {canManageWorkspace ? (
                                    <div className="flex shrink-0 items-center gap-2">
                                      <OverviewActionButton
                                        label={`Sửa công việc ${task.title?.trim() || ""}`}
                                        onClick={() => openEditTask(task)}
                                        icon={
                                          <svg
                                            className="size-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                            />
                                          </svg>
                                        }
                                      />
                                      {canDelete ? (
                                      <OverviewActionButton
                                        label={`Xóa công việc ${task.title?.trim() || ""}`}
                                        tone="danger"
                                        onClick={() =>
                                          setDeleteTarget({
                                            kind: "task",
                                            id: task.id,
                                            label:
                                              task.title ??
                                              "công việc chưa đặt tên",
                                          })
                                        }
                                        icon={
                                          <svg
                                            className="size-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                          </svg>
                                        }
                                      />
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </article>
                            ))}
                          </div>

                          <div className="hidden overflow-x-auto xl:block">
                            <table className="min-w-full border-collapse text-left">
                              <thead className="bg-bg-secondary">
                                <tr className="text-sm text-text-secondary">
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Công việc
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Trạng thái
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Ưu tiên
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Hạn xử lý
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 font-medium"
                                  >
                                    Nhân sự thực hiện
                                  </th>
                                  <th
                                    scope="col"
                                    className="w-20 px-4 py-3 text-right"
                                  >
                                    <span className="sr-only">Thao tác</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {tasks.map((task) => (
                                  <tr
                                    key={task.id}
                                    role="button"
                                    tabIndex={0}
                                    className="group cursor-pointer border-t border-border-default bg-bg-surface align-top transition-colors hover:bg-bg-secondary/50 focus-within:bg-bg-secondary/50"
                                    onClick={() =>
                                      push(buildTaskDetailHref(task.id))
                                    }
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        push(buildTaskDetailHref(task.id));
                                      }
                                    }}
                                    aria-label={`Xem chi tiết công việc ${task.title?.trim() || ""}`}
                                  >
                                    <td className="px-4 py-4">
                                      <div className="min-w-[12rem]">
                                        <p className="font-medium text-text-primary">
                                          {task.title ?? "Công việc chưa đặt tên"}
                                        </p>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskStatusChipClass(
                                          task.status,
                                        )}`}
                                      >
                                        {LESSON_TASK_STATUS_LABELS[task.status]}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${lessonTaskPriorityChipClass(
                                          task.priority,
                                        )}`}
                                      >
                                        {LESSON_TASK_PRIORITY_LABELS[task.priority]}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-text-secondary">
                                      {formatLessonDateOnly(task.dueDate)}
                                    </td>
                                    <td className="px-4 py-4 text-sm text-text-secondary">
                                      {formatTaskAssigneeSummary(task.assignees)}
                                    </td>
                                    <td
                                      className="px-4 py-4"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {canManageWorkspace ? (
                                        <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                          <button
                                            type="button"
                                            onClick={() => openEditTask(task)}
                                            className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-primary/12 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                                            aria-label={`Sửa công việc ${task.title?.trim() || ""}`}
                                            title="Sửa công việc"
                                          >
                                            <svg
                                              className="size-4"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                              aria-hidden
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                              />
                                            </svg>
                                          </button>
                                          {canDelete ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setDeleteTarget({
                                                kind: "task",
                                                id: task.id,
                                                label:
                                                  task.title ??
                                                  "công việc chưa đặt tên",
                                              })
                                            }
                                            className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                                            aria-label={`Xóa công việc ${task.title?.trim() || ""}`}
                                            title="Xóa công việc"
                                          >
                                            <svg
                                              className="size-4"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                              aria-hidden
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                              />
                                            </svg>
                                          </button>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="px-4 py-4">
                            <TablePagination
                              label="Công việc"
                              isPending={isTaskListPending}
                              meta={
                                data?.tasksMeta ?? {
                                  total: tasks.length,
                                  page: 1,
                                  limit: TASK_PAGE_SIZE,
                                  totalPages: 1,
                                }
                              }
                              onPageChange={(page) =>
                                setListPage("taskPage", page)
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </motion.section>
          ) : activeTabState === "work" ? (
            <motion.div key="work" className="min-w-0" {...panelMotionProps}>
              <LessonWorkTab
                basePagePath={basePath}
                outputAccessMode={resolvedWorkAccessMode}
                createAccessMode={resolvedCreateOutputAccessMode}
                allowCreate={canCreate}
                allowBulkPaymentStatusEdit={resolvedWorkAccessMode !== "participant"}
                allowDelete={canDelete}
              />
            </motion.div>
          ) : (
            <motion.div key="exercises" className="min-w-0" {...panelMotionProps}>
              <LessonExercisesTab
                basePagePath={basePath}
                manageDetailsPath={manageDetailsPath}
                participantMode={participantMode}
              />
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      <LessonResourceFormPopup
        key={`resource-${resourceMode}-${selectedResource?.id ?? "new"}`}
        open={resourcePopupOpen}
        mode={resourceMode}
        initialData={selectedResource}
        requireTaskSelection={participantMode}
        isSubmitting={
          createResourceMutation.isPending || updateResourceMutation.isPending
        }
        onClose={() => {
          if (
            createResourceMutation.isPending ||
            updateResourceMutation.isPending
          )
            return;
          setResourcePopupOpen(false);
          setSelectedResource(null);
          setResourceMode("create");
        }}
        onSubmit={handleResourceSubmit}
      />

      {canManageWorkspace ? (
        <>
          <LessonTaskFormPopup
            key={`task-${taskMode}-${selectedTask?.id ?? "new"}`}
            open={taskPopupOpen}
            mode={taskMode}
            initialData={selectedTask}
            isSubmitting={
              createTaskMutation.isPending || updateTaskMutation.isPending
            }
            onClose={() => {
              if (createTaskMutation.isPending || updateTaskMutation.isPending)
                return;
              setTaskPopupOpen(false);
              setSelectedTask(null);
              setTaskMode("create");
            }}
            onSubmit={handleTaskSubmit}
          />

          <LessonDeleteConfirmPopup
            open={deleteTarget !== null}
            title={
              deleteTarget?.kind === "resource"
                ? "Xóa tài nguyên giáo án?"
                : "Xóa công việc giáo án?"
            }
            description={
              deleteTarget
                ? `Thao tác này sẽ xóa ${deleteTarget.kind === "resource" ? "tài nguyên" : "công việc"} “${deleteTarget.label}”. Dữ liệu sẽ biến mất khỏi tab Tổng quan ngay sau khi xác nhận.`
                : ""
            }
            confirmLabel={
              deleteTarget?.kind === "resource"
                ? "Xóa tài nguyên"
                : "Xóa công việc"
            }
            onClose={() => {
              if (isDeletePending) return;
              setDeleteTarget(null);
            }}
            onConfirm={handleDeleteConfirm}
            isSubmitting={isDeletePending}
          />
        </>
      ) : null}
    </div>
  );
}
