"use client";

import { Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { getFullProfile } from "@/lib/apis/auth.api";
import {
  authKeys,
  courseKeys,
  practiceLessonQuestionKeys,
} from "@/lib/query-keys";
import { invalidateCoursePracticeLessonQueries } from "@/lib/query-invalidation";
import { resolveCourseWorkspaceCapabilities } from "@/lib/course-workspace-access";
import {
  courseDetailHref,
  lessonHref,
  moduleLessonsHref,
} from "@/lib/course-content-routes";
import { PracticeLessonQuestionsCard } from "@/components/admin/PracticeLessonQuestionsCard";
import {
  LessonEditorSkeleton,
  LessonWorkspaceSkeleton,
} from "@/components/course-workspace/CourseWorkspaceSkeletons";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { cn } from "@/lib/utils";
import type { CourseWorkspaceRouteBase } from "@/dtos/course-workspace.dto";
import type {
  LessonKind,
  UpdateCourseLessonPayload,
} from "@/dtos/course-content.dto";
import { TheoryLessonEditor } from "@/components/course-workspace/TheoryLessonEditor";
import { WorkspaceBreadcrumb } from "@/components/course-workspace/WorkspaceBreadcrumb";
import { PracticeDurationField } from "@/components/course-workspace/PracticeDurationField";
import { parseAssignmentDurationMinutes } from "@/lib/assignment-schedule.helpers";
import {
  lessonKindBadgeClass,
  lessonKindLabel,
} from "@/lib/course-content-labels";

const SHELL_CLASS = "flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-6";

type ApiError = { response?: { data?: { message?: string } } };

function LessonWorkspaceInner({
  routeBase,
  mode,
}: {
  routeBase: CourseWorkspaceRouteBase;
  mode: "create" | "edit";
}) {
  const params = useParams<{ id: string; moduleId: string; lessonId?: string }>();
  const courseId = params.id;
  const moduleId = params.moduleId;
  const lessonId = mode === "edit" ? params.lessonId : undefined;
  const { replace } = useRouter();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const hydrated = useHydrated();

  const fieldId = useId();
  const { data: fullProfile, isLoading: profileLoading } = useQuery({
    queryKey: authKeys.fullProfile(),
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const capabilities = resolveCourseWorkspaceCapabilities(fullProfile, routeBase);
  const canEdit = capabilities.canMutateContent;

  const { data: course } = useQuery({
    queryKey: courseKeys.detail(courseId),
    queryFn: () => classApi.getCourseById(courseId),
    enabled: Boolean(courseId),
  });
  const { data: courseModule } = useQuery({
    queryKey: courseKeys.module(courseId, moduleId),
    queryFn: () => classApi.getModule(courseId, moduleId),
    enabled: Boolean(courseId && moduleId),
  });
  const {
    data: lesson,
    isLoading: lessonLoading,
    isError: lessonError,
  } = useQuery({
    queryKey: [...courseKeys.lessons(courseId, moduleId), lessonId],
    queryFn: () => classApi.getCourseLesson(courseId, moduleId, lessonId!),
    enabled: mode === "edit" && Boolean(lessonId),
  });

  const [kind, setKind] = useState<LessonKind | null>(null);
  const [title, setTitle] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const parsedDuration = parseAssignmentDurationMinutes(durationMinutes);

  // Đồng bộ form khi dữ liệu tiết học đổi — chỉnh state ngay trong render thay vì effect.
  const [syncedLesson, setSyncedLesson] = useState<typeof lesson>(undefined);
  if (lesson && lesson !== syncedLesson) {
    setSyncedLesson(lesson);
    setTitle(lesson.title);
    setSavedTitle(lesson.title);
    setKind(lesson.kind);
    setDurationMinutes(
      lesson.durationMinutes != null ? String(lesson.durationMinutes) : "",
    );
  }

  const backToLessons = moduleLessonsHref(routeBase, courseId, moduleId);

  const createMutation = useMutation({
    mutationFn: () =>
      classApi.createCourseLesson(courseId, moduleId, {
        kind: kind!,
        title: title.trim(),
        ...(kind === "practice" && parsedDuration != null
          ? { durationMinutes: parsedDuration }
          : {}),
      }),
    onSuccess: (created) => {
      toast.success("Đã tạo tiết học.");
      void invalidateCoursePracticeLessonQueries(queryClient, courseId);
      replace(lessonHref(routeBase, courseId, moduleId, created.id));
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Không thể tạo tiết học.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (patch: UpdateCourseLessonPayload) =>
      classApi.updateCourseLesson(courseId, moduleId, lessonId!, patch),
  });

  const saveTitle = () => {
    if (!lesson || !canEdit) return;
    const next = title.trim();
    if (!next || next === savedTitle) {
      setTitle(savedTitle || lesson.title);
      return;
    }
    updateMutation.mutate(
      { title: next },
      {
        onSuccess: () => {
          setSavedTitle(next);
          toast.success("Đã lưu tên tiết học.");
          void invalidateCoursePracticeLessonQueries(queryClient, courseId);
        },
        onError: (err) => {
          toast.error((err as ApiError)?.response?.data?.message || "Không thể lưu tên.");
          setTitle(savedTitle);
        },
      },
    );
  };

  const saveDuration = (next: string) => {
    const minutes = parseAssignmentDurationMinutes(next);
    if (!lesson || !canEdit || minutes == null) return;
    const previous = durationMinutes;
    setDurationMinutes(next);
    updateMutation.mutate(
      { durationMinutes: minutes },
      {
        onSuccess: () => {
          toast.success("Đã lưu thời lượng làm bài.");
          void queryClient.invalidateQueries({
            queryKey: courseKeys.lessons(courseId, moduleId),
          });
        },
        onError: (err) => {
          toast.error(
            (err as ApiError)?.response?.data?.message ||
              "Không thể lưu thời lượng.",
          );
          setDurationMinutes(previous);
        },
      },
    );
  };

  const saveElectiveNames = (
    patch: Pick<UpdateCourseLessonPayload, "elective1Name" | "elective2Name">,
  ) =>
    updateMutation.mutate(patch, {
      onSuccess: () => {
        toast.success("Đã lưu tên nhóm tự chọn.");
        void queryClient.invalidateQueries({
          queryKey: courseKeys.lessons(courseId, moduleId),
        });
        if (lessonId) {
          void queryClient.invalidateQueries({
            queryKey: practiceLessonQuestionKeys.summary(lessonId),
          });
        }
      },
      onError: (err) =>
        toast.error((err as ApiError)?.response?.data?.message || "Không thể lưu tên nhóm."),
    });

  const deleteMutation = useMutation({
    mutationFn: () => classApi.deleteCourseLesson(courseId, moduleId, lessonId!),
    onSuccess: async () => {
      toast.success("Đã xoá tiết học.");
      await invalidateCoursePracticeLessonQueries(queryClient, courseId);
      replace(backToLessons);
    },
    onError: (err) =>
      toast.error((err as ApiError)?.response?.data?.message || "Không thể xoá tiết học."),
  });

  const deleteLesson = async () => {
    if (!lesson) return;
    const ok = await confirm({
      title: "Xoá tiết học?",
      description: `Xoá tiết học "${lesson.title}"? Không xoá được nếu lớp đang dùng nội dung này.`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate();
  };

  useEffect(() => {
    if (profileLoading) return;
    if (!capabilities.canEnterWorkspace || !capabilities.canViewContentTab) {
      replace(capabilities.listHref);
    }
  }, [
    capabilities.canEnterWorkspace,
    capabilities.canViewContentTab,
    capabilities.listHref,
    profileLoading,
    replace,
  ]);

  // `hydrated`: render lần hydrate phải khớp HTML server (skeleton) dù cache client đã có profile.
  if (
    !hydrated ||
    profileLoading ||
    !capabilities.canEnterWorkspace ||
    !capabilities.canViewContentTab
  ) {
    return <LessonWorkspaceSkeleton />;
  }

  if (mode === "edit" && (lessonError || (!lessonLoading && !lesson))) {
    return (
      <div className={SHELL_CLASS}>
        <p className="text-sm text-error">Không tìm thấy tiết học.</p>
        <Link href={backToLessons} className="mt-2 text-sm text-primary underline">
          Quay lại chuyên đề
        </Link>
      </div>
    );
  }

  return (
    <div className={SHELL_CLASS}>
      <div
        className={cn(
          "mx-auto flex min-h-0 w-full flex-1 flex-col gap-4",
          lesson?.kind === "practice" ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        <WorkspaceBreadcrumb
          backHref={backToLessons}
          items={[
            { label: "Khoá học", href: capabilities.listHref },
            {
              label: course?.name,
              href: courseDetailHref(routeBase, courseId, { tab: "noi-dung" }),
            },
            { label: courseModule?.title, href: backToLessons },
            {
              label:
                mode === "create"
                  ? "Thêm tiết học"
                  : savedTitle || lesson?.title,
            },
          ]}
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          {mode === "create" ? (
            <div className="flex flex-col gap-4 overflow-y-auto">
              <div>
                <h1 className="text-xl font-semibold text-text-primary">Thêm tiết học</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Chọn loại một lần — sau khi tạo không đổi được.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setKind("theory")}
                  className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                    kind === "theory"
                      ? "border-primary bg-primary/10"
                      : "border-border-default hover:bg-bg-tertiary"
                  }`}
                >
                  <p className="text-sm font-semibold text-text-primary">
                    {lessonKindLabel("theory")}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Video, nội dung và bài tập ôn nhẹ tuỳ chọn.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setKind("practice")}
                  className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                    kind === "practice"
                      ? "border-warning bg-warning/10"
                      : "border-border-default hover:bg-bg-tertiary"
                  }`}
                >
                  <p className="text-sm font-semibold text-text-primary">
                    {lessonKindLabel("practice")}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Thuần tập câu hỏi, không video hay khối nội dung. Gia sư giao vào lớp sau.
                  </p>
                </button>
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-create-title`}
                  className="mb-1 block text-xs font-medium text-text-muted"
                >
                  Tên tiết học
                </label>
                <input
                  id={`${fieldId}-create-title`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Ma trận và định thức"
                  className="w-full rounded-md border border-border-default px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </div>
              {kind === "practice" ? (
                <PracticeDurationField
                  value={durationMinutes}
                  onValueChange={setDurationMinutes}
                />
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Link
                  href={backToLessons}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default px-4 py-2 text-sm font-medium text-text-secondary sm:min-h-10"
                >
                  Huỷ
                </Link>
                <button
                  type="button"
                  disabled={
                    !kind ||
                    !title.trim() ||
                    (kind === "practice" && parsedDuration == null) ||
                    createMutation.isPending
                  }
                  onClick={() => createMutation.mutate()}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60 sm:min-h-10"
                >
                  {createMutation.isPending ? "Đang tạo…" : "Tạo tiết học"}
                </button>
              </div>
            </div>
          ) : lesson ? (
            <div className="flex min-h-0 flex-1 flex-col gap-5">
              <div className="shrink-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  {kind ? (
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${lessonKindBadgeClass(kind)}`}
                    >
                      {lessonKindLabel(kind)}
                    </span>
                  ) : (
                    <span />
                  )}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => void deleteLesson()}
                      disabled={deleteMutation.isPending}
                      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-error/30 px-3 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-60"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Xoá tiết học
                    </button>
                  ) : null}
                </div>
                <label
                  htmlFor={`${fieldId}-edit-title`}
                  className="mb-1 block text-xs font-medium text-text-muted"
                >
                  Tên tiết học
                </label>
                <input
                  id={`${fieldId}-edit-title`}
                  value={title}
                  disabled={!canEdit}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full rounded-md border border-border-default px-3 py-2 text-base font-semibold text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
                />
                {canEdit ? (
                  <p className="mt-1 text-xs text-text-muted">
                    Lưu khi rời ô nhập hoặc nhấn Enter.
                  </p>
                ) : null}
                {lesson.kind === "practice" ? (
                  <div className="mt-4">
                    <PracticeDurationField
                      value={durationMinutes}
                      onValueChange={saveDuration}
                      disabled={!canEdit || updateMutation.isPending}
                      hint="Áp cho mọi lớp từ lượt bắt đầu sau khi lưu; lượt đang làm giữ thời lượng cũ."
                    />
                  </div>
                ) : null}
              </div>

              {lesson.kind === "practice" ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <PracticeLessonQuestionsCard
                    key={lesson.id}
                    lessonId={lesson.id}
                    courseId={courseId}
                    canEdit={canEdit}
                    electiveGroupNames={lesson}
                    onUpdateLesson={saveElectiveNames}
                  />
                </div>
              ) : (
                <TheoryLessonEditor
                  key={lesson.id}
                  courseId={courseId}
                  moduleId={moduleId}
                  lesson={lesson}
                  canEdit={canEdit}
                />
              )}
            </div>
          ) : (
            <LessonEditorSkeleton />
          )}
        </section>
      </div>
      {dialog}
    </div>
  );
}

export default function LessonWorkspace({
  routeBase,
  mode,
}: {
  routeBase: CourseWorkspaceRouteBase;
  mode: "create" | "edit";
}) {
  return (
    <Suspense fallback={<LessonWorkspaceSkeleton />}>
      <LessonWorkspaceInner routeBase={routeBase} mode={mode} />
    </Suspense>
  );
}
