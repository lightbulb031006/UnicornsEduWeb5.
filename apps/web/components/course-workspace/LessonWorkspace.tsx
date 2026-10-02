"use client";

import { Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { getFullProfile } from "@/lib/apis/auth.api";
import { authKeys, courseKeys } from "@/lib/query-keys";
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
import type { CourseWorkspaceRouteBase } from "@/dtos/course-workspace.dto";
import type { LessonKind } from "@/dtos/course-content.dto";
import { TheoryLessonEditor } from "@/components/course-workspace/TheoryLessonEditor";
import {
  lessonKindBadgeClass,
  lessonKindLabel,
} from "@/lib/course-content-labels";

const SHELL_CLASS = "flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-6";

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

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setSavedTitle(lesson.title);
      setKind(lesson.kind);
    }
  }, [lesson]);

  const backToLessons = moduleLessonsHref(routeBase, courseId, moduleId);

  const createMutation = useMutation({
    mutationFn: () =>
      classApi.createCourseLesson(courseId, moduleId, {
        kind: kind!,
        title: title.trim(),
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

  const saveTitle = () => {
    if (!lesson || !canEdit) return;
    const next = title.trim();
    if (!next || next === savedTitle) {
      setTitle(savedTitle || lesson.title);
      return;
    }
    classApi
      .updateCourseLesson(courseId, moduleId, lesson.id, { title: next })
      .then(() => {
        setSavedTitle(next);
        toast.success("Đã lưu tên tiết học.");
        void invalidateCoursePracticeLessonQueries(queryClient, courseId);
      })
      .catch((err: { response?: { data?: { message?: string } } }) => {
        toast.error(err?.response?.data?.message || "Không thể lưu tên.");
        setTitle(savedTitle);
      });
  };

  const deleteLesson = async () => {
    if (!lesson) return;
    const ok = await confirm({
      title: "Xoá tiết học?",
      description: `Xoá tiết học "${lesson.title}"? Không xoá được nếu lớp đang dùng nội dung này.`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await classApi.deleteCourseLesson(courseId, moduleId, lesson.id);
      toast.success("Đã xoá tiết học.");
      await invalidateCoursePracticeLessonQueries(queryClient, courseId);
      replace(backToLessons);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(message || "Không thể xoá tiết học.");
    }
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

  if (profileLoading || !capabilities.canEnterWorkspace || !capabilities.canViewContentTab) {
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
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4">
        <nav className="flex shrink-0 flex-wrap items-center gap-1 text-sm text-text-secondary">
          <Link href={capabilities.listHref} className="hover:text-text-primary">
            Khoá học
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={courseDetailHref(routeBase, courseId, { tab: "noi-dung" })}
            className="hover:text-text-primary"
          >
            {course?.name ?? "Khoá"}
          </Link>
          <span aria-hidden>/</span>
          <Link href={backToLessons} className="hover:text-text-primary">
            {courseModule?.title ?? "Chuyên đề"}
          </Link>
        </nav>

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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Link
                  href={backToLessons}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default px-4 py-2 text-sm font-medium text-text-secondary sm:min-h-10"
                >
                  Huỷ
                </Link>
                <button
                  type="button"
                  disabled={!kind || !title.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60 sm:min-h-10"
                >
                  {createMutation.isPending ? "Đang tạo…" : "Tạo tiết học"}
                </button>
              </div>
            </div>
          ) : lesson ? (
            <div className="flex min-h-0 flex-1 flex-col gap-5">
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {kind ? (
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${lessonKindBadgeClass(kind)}`}
                      >
                        {lessonKindLabel(kind)}
                      </span>
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
                    <p className="mt-1 text-xs text-text-muted">Lưu khi rời ô nhập.</p>
                  ) : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void deleteLesson()}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/10 sm:min-h-10"
                  >
                    Xoá tiết học
                  </button>
                ) : null}
              </div>

              {lesson.kind === "practice" ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <PracticeLessonQuestionsCard
                    lessonId={lesson.id}
                    courseId={courseId}
                    canEdit={canEdit}
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
