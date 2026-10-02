"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "framer-motion";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { CourseFormPopup, type CourseFormValues } from "@/components/admin/class";
import { Switch } from "@/components/ui/switch";
import { confirmOrderDirtyLeave, useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { authKeys, classKeys, courseKeys } from "@/lib/query-keys";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { getFullProfile } from "@/lib/apis/auth.api";
import {
  resolveCourseWorkspaceCapabilities,
  resolveCourseWorkspaceTab,
} from "@/lib/course-workspace-access";
import { ContentTab } from "@/components/course-workspace/tabs/ContentTab";
import { QuestionBankTab } from "@/components/course-workspace/tabs/QuestionBankTab";
import { SettingsTab } from "@/components/course-workspace/tabs/SettingsTab";
import { CourseDetailSkeleton } from "@/components/course-workspace/CourseWorkspaceSkeletons";
import {
  COURSE_WORKSPACE_TAB_LABELS,
  LEGACY_EXAM_TAB_ID,
  type CourseWorkspaceRouteBase,
  type CourseWorkspaceTabId,
} from "@/dtos/course-workspace.dto";
import { replaceCourseWorkspaceUrl } from "@/lib/course-content-routes";

const INVALID_TAB_TOAST_ID = "course-workspace-invalid-tab";
const FORBIDDEN_TAB_TOAST_ID = "course-workspace-forbidden-tab";

function CourseDetailWorkspaceInner({
  routeBase,
}: {
  routeBase: CourseWorkspaceRouteBase;
}) {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const [formOpen, setFormOpen] = useState(false);
  const [contentOrderDirty, setContentOrderDirty] = useState(false);

  const { data: fullProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: authKeys.fullProfile(),
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const capabilities = resolveCourseWorkspaceCapabilities(fullProfile, routeBase);
  const tabParam = searchParams.get("tab");
  const normalizedTabParam =
    tabParam === LEGACY_EXAM_TAB_ID ? "noi-dung" : tabParam;
  // Đổi tab ngay khi bấm, không chờ Next.js commit URL.
  const [pendingTab, setPendingTab] = useState<string | null | undefined>(
    undefined,
  );
  if (pendingTab !== undefined && pendingTab === normalizedTabParam) {
    setPendingTab(undefined);
  }
  const visibleTabParam = pendingTab !== undefined ? pendingTab : normalizedTabParam;
  const tabResolve = resolveCourseWorkspaceTab(
    visibleTabParam,
    capabilities.visibleTabIds,
  );

  useEffect(() => {
    if (tabParam !== LEGACY_EXAM_TAB_ID) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "noi-dung");
    replaceCourseWorkspaceUrl(`${pathname}?${params.toString()}`);
  }, [pathname, searchParams, tabParam]);

  useEffect(() => {
    if (isProfileLoading) return;
    if (tabResolve.status === "unknown") {
      toast.error("Đường dẫn không hợp lệ. Tab này không tồn tại.", {
        id: INVALID_TAB_TOAST_ID,
      });
      replace(capabilities.listHref);
      return;
    }
    if (tabResolve.status === "forbidden") {
      toast.error("Bạn không có quyền mở tab này.", {
        id: FORBIDDEN_TAB_TOAST_ID,
      });
      replace(capabilities.listHref);
    }
  }, [
    capabilities.listHref,
    isProfileLoading,
    replace,
    tabResolve.status,
  ]);

  const { data: course, isLoading, isError, refetch } = useQuery({
    queryKey: courseKeys.detail(courseId),
    queryFn: () => classApi.getCourseById(courseId),
    enabled: Boolean(courseId),
  });

  const invalidateCourseData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) }),
      queryClient.invalidateQueries({ queryKey: courseKeys.all }),
      queryClient.invalidateQueries({ queryKey: classKeys.all }),
    ]);
  };

  const handleSubmit = async (values: CourseFormValues) => {
    setFormOpen(false);
    runBackgroundSave({
      loadingMessage: "Đang lưu khoá học...",
      successMessage: "Đã lưu khoá học.",
      errorMessage: "Không thể lưu khoá học.",
      action: () =>
        classApi.updateCourse(courseId, {
          name: values.name,
          sort_order: values.sortOrder,
          default_duration_days: values.defaultDurationDays,
        }),
      onSuccess: invalidateCourseData,
    });
  };

  const handleToggleActive = (nextActive: boolean) => {
    runBackgroundSave({
      loadingMessage: "Đang cập nhật khoá học...",
      successMessage: "Đã cập nhật khoá học.",
      errorMessage: "Không thể cập nhật khoá học.",
      action: () => classApi.updateCourse(courseId, { is_active: nextActive }),
      onSuccess: invalidateCourseData,
    });
  };

  const handleDelete = async () => {
    if (!course) return;
    const ok = await confirm({
      title: "Xoá khoá học?",
      description: `Xoá khoá học "${course.name}"? Chỉ xoá được khi không còn lớp nào dùng khoá này.`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    runBackgroundSave({
      loadingMessage: "Đang xoá khoá học...",
      successMessage: "Đã xoá khoá học.",
      errorMessage: "Không thể xoá khoá học.",
      action: () => classApi.deleteCourse(courseId),
      onSuccess: async () => {
        await invalidateCourseData();
        replace(capabilities.listHref);
      },
    });
  };

  const selectTab = async (tabId: CourseWorkspaceTabId) => {
    if (tabId !== "noi-dung") {
      const ok = await confirmOrderDirtyLeave(confirm, contentOrderDirty);
      if (!ok) return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tabId);
    setPendingTab(tabId);
    replaceCourseWorkspaceUrl(`${pathname}?${next.toString()}`);
  };

  const activeTab = tabResolve.tab;

  if (isLoading || isProfileLoading) {
    return <CourseDetailSkeleton />;
  }

  if (tabResolve.status === "unknown" || tabResolve.status === "forbidden") {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
        <p className="text-sm text-text-secondary">Đang chuyển hướng...</p>
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
        <p className="text-sm text-error">
          Không tải được khoá học.{" "}
          <button type="button" onClick={() => refetch()} className="underline">
            Thử lại
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section className="relative overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href={capabilities.listHref}
                onClick={(event) => {
                  if (!contentOrderDirty) return;
                  event.preventDefault();
                  void confirmOrderDirtyLeave(confirm, true).then((ok) => {
                    if (ok) replace(capabilities.listHref);
                  });
                }}
                className="mb-1 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Khoá học
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                  {course.name}
                </h1>
                {!course.isActive ? (
                  <span className="rounded bg-error/10 px-1.5 py-0.5 text-xs text-error">Đã ẩn</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                Thời hạn mặc định:{" "}
                <span className="font-medium text-text-primary">
                  {course.defaultDurationDays == null
                    ? "Vô hạn"
                    : `${course.defaultDurationDays} ngày`}
                </span>
                {" · "}
                Mức độ khó: {course.difficultyLevels?.length ?? 0} · Đội giáo án:{" "}
                {course.lessonPlanMembers?.length ?? 0} · Lớp học: {course._count?.classes ?? 0}
              </p>
            </div>
            {capabilities.canMutateCourses ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>Hoạt động</span>
                  <Switch
                    checked={course.isActive}
                    onCheckedChange={handleToggleActive}
                    aria-label={`Bật/tắt hoạt động cho ${course.name}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:min-h-10"
                >
                  Sửa khoá học
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-error/30 bg-bg-surface px-4 py-2 text-sm font-medium text-error transition-colors duration-200 hover:bg-error/10 sm:min-h-10"
                >
                  Xoá
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <div
          className="-mx-1 overflow-x-auto px-1"
          role="tablist"
          aria-label="Nội dung khoá học"
        >
          <div className="inline-flex min-w-full items-center gap-1 rounded-2xl border border-border-default bg-bg-secondary/70 p-1.5 shadow-xs sm:min-w-0">
            {capabilities.visibleTabIds.map((tabId) => {
              const selected = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => void selectTab(tabId)}
                  className="relative z-10 flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:min-h-10 sm:px-3 sm:text-sm"
                >
                  {selected ? (
                    <m.span
                      layoutId="course-workspace-tab-pill"
                      className="absolute inset-0 -z-10 rounded-xl bg-primary shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  ) : null}
                  <span className={selected ? "text-text-inverse" : "text-text-secondary"}>
                    {COURSE_WORKSPACE_TAB_LABELS[tabId]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {activeTab ? (
            <m.section
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === "noi-dung" ? (
                <ContentTab
                  courseId={courseId}
                  canEdit={capabilities.canMutateContent}
                  routeBase={routeBase}
                  onOrderDirtyChange={setContentOrderDirty}
                />
              ) : null}
              {activeTab === "cau-hoi" ? (
                <QuestionBankTab
                  courseId={courseId}
                  canMutateQuestions={capabilities.canMutateQuestions}
                  canViewContentTab={capabilities.canViewContentTab}
                  onOpenContentTab={() => void selectTab("noi-dung")}
                />
              ) : null}
              {activeTab === "cai-dat" ? (
                <SettingsTab
                  courseId={courseId}
                  capabilities={{
                    canMutateDifficultyLevels:
                      capabilities.canMutateDifficultyLevels,
                    canViewLessonPlanTeam: capabilities.canViewLessonPlanTeam,
                    canMutateLessonPlanTeam:
                      capabilities.canMutateLessonPlanTeam,
                  }}
                />
              ) : null}
            </m.section>
          ) : null}
        </AnimatePresence>
      </div>

      {capabilities.canMutateCourses ? (
        <CourseFormPopup
          open={formOpen}
          course={course}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      ) : null}
      {dialog}
    </div>
  );
}

export default function CourseDetailWorkspace({
  routeBase,
}: {
  routeBase: CourseWorkspaceRouteBase;
}) {
  return (
    <Suspense fallback={<CourseDetailSkeleton />}>
      <CourseDetailWorkspaceInner routeBase={routeBase} />
    </Suspense>
  );
}
