"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as classApi from "@/lib/apis/class.api";
import {
  CourseFormPopup,
  CourseOneTimeBadge,
  type CourseFormValues,
} from "@/components/admin/class";
import { Switch } from "@/components/ui/switch";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { courseKeys, classKeys, authKeys } from "@/lib/query-keys";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { getFullProfile } from "@/lib/apis/auth.api";
import { resolveCourseWorkspaceCapabilities } from "@/lib/course-workspace-access";
import { CourseListSkeleton } from "@/components/course-workspace/CourseWorkspaceSkeletons";
import type { Course } from "@/dtos/class.dto";
import type { CourseWorkspaceRouteBase } from "@/dtos/course-workspace.dto";

function formatDuration(course: Course) {
  if (course.defaultDurationDays == null) {
    return "Vô hạn";
  }
  return `${course.defaultDurationDays} ngày`;
}

export default function CourseListWorkspace({
  routeBase,
}: {
  routeBase: CourseWorkspaceRouteBase;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const { data: fullProfile } = useQuery({
    queryKey: authKeys.fullProfile(),
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const capabilities = resolveCourseWorkspaceCapabilities(fullProfile, routeBase);

  const {
    data: courses = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: courseKeys.list(true),
    queryFn: () => classApi.getCourses(true),
  });

  const invalidateCourseData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKeys.all }),
      queryClient.invalidateQueries({ queryKey: classKeys.all }),
    ]);
  };

  const handleToggleActive = (course: Course, nextActive: boolean) => {
    runBackgroundSave({
      loadingMessage: "Đang cập nhật khoá học...",
      successMessage: "Đã cập nhật khoá học.",
      errorMessage: "Không thể cập nhật khoá học.",
      action: () => classApi.updateCourse(course.id, { is_active: nextActive }),
      onSuccess: invalidateCourseData,
    });
  };
  const openCreateForm = () => {
    setEditingCourse(null);
    setFormOpen(true);
  };

  const openEditForm = (course: Course) => {
    setEditingCourse(course);
    setFormOpen(true);
  };

  const handleSubmit = async (values: CourseFormValues) => {
    setFormOpen(false);
    if (editingCourse) {
      runBackgroundSave({
        loadingMessage: "Đang cập nhật khoá học...",
        successMessage: "Đã cập nhật khoá học.",
        errorMessage: "Không thể cập nhật khoá học.",
        action: () =>
          classApi.updateCourse(editingCourse.id, {
            name: values.name,
            sort_order: values.sortOrder,
            default_duration_days: values.defaultDurationDays,
            ...(capabilities.canChangeCourseSaleMode &&
            values.isOneTime !== editingCourse.isOneTime
              ? { is_one_time: values.isOneTime }
              : {}),
          }),
        onSuccess: invalidateCourseData,
      });
      return;
    }

    runBackgroundSave({
      loadingMessage: "Đang thêm khoá học...",
      successMessage: "Đã thêm khoá học.",
      errorMessage: "Không thể thêm khoá học.",
      action: () =>
        classApi.createCourse({
          name: values.name,
          sort_order: values.sortOrder,
          default_duration_days: values.defaultDurationDays,
          ...(capabilities.canChangeCourseSaleMode && values.isOneTime
            ? { is_one_time: true }
            : {}),
        }),
      onSuccess: invalidateCourseData,
    });
  };

  const handleDelete = async (course: Course) => {
    const ok = await confirm({
      title: "Xoá khoá học?",
      description: `Xoá khoá học "${course.name}"? Hành động này không thể hoàn tác. Chỉ xoá được khi không còn lớp nào dùng khoá này.`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    runBackgroundSave({
      loadingMessage: "Đang xoá khoá học...",
      successMessage: "Đã xoá khoá học.",
      errorMessage: "Không thể xoá khoá học.",
      action: () => classApi.deleteCourse(course.id),
      onSuccess: invalidateCourseData,
    });
  };

  if (isLoading) {
    return <CourseListSkeleton />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="relative mb-4 overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-10 left-16 size-28 rounded-full bg-warning/10 blur-2xl" aria-hidden />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {routeBase === "/admin" ? (
                <Link
                  href="/admin/classes"
                  className="mb-1 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Lớp học
                </Link>
              ) : null}
              <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Khoá học</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Thêm, sửa, ẩn hoặc xoá các khoá học dùng khi tạo lớp học.
              </p>
            </div>
            {capabilities.canMutateCourses ? (
              <button
                type="button"
                onClick={openCreateForm}
                className="self-end inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:min-h-10 sm:self-auto"
              >
                <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Thêm khoá học</span>
              </button>
            ) : null}
          </div>
        </section>

        <div className="min-w-0 flex-1 overflow-auto">
          {isError ? (
            <div className="p-4 text-sm text-error">
              Không tải được danh sách khoá học.{" "}
              <button type="button" onClick={() => refetch()} className="underline">
                Thử lại
              </button>
            </div>
          ) : courses.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">
              {capabilities.canViewAllCourses
                ? "Chưa có khoá học nào."
                : "Bạn chưa được gán vào đội giáo án của khoá nào."}
            </p>
          ) : (
            <ul className="space-y-2">
              {courses.map((course) => (
                <li
                  key={course.id}
                  className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={capabilities.detailHref(course.id)}
                        className="font-medium text-text-primary hover:text-primary hover:underline"
                      >
                        {course.name}
                      </Link>
                      {!course.isActive ? (
                        <span className="rounded bg-error/10 px-1.5 py-0.5 text-xs text-error">
                          Đã ẩn
                        </span>
                      ) : null}
                      <CourseOneTimeBadge isOneTime={course.isOneTime} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                      <span>Thứ tự: {course.sortOrder}</span>
                      <span>Thời hạn: {formatDuration(course)}</span>
                      {typeof course._count?.difficultyLevels === "number" ? (
                        <span>Mức độ khó: {course._count.difficultyLevels}</span>
                      ) : null}
                      {typeof course._count?.lessonPlanMembers === "number" ? (
                        <span>Đội giáo án: {course._count.lessonPlanMembers}</span>
                      ) : null}
                      {typeof course._count?.classes === "number" ? (
                        <span>Lớp học: {course._count.classes}</span>
                      ) : null}
                    </div>
                  </div>

                  {capabilities.canMutateCourses ? (
                    <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                      <label className="flex items-center gap-2 text-xs text-text-secondary">
                        <span>Hoạt động</span>
                        <Switch
                          checked={course.isActive}
                          onCheckedChange={(next) => handleToggleActive(course, next)}
                          aria-label={`Bật/tắt hoạt động cho ${course.name}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openEditForm(course)}
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(course)}
                        className="rounded-md border border-error/30 bg-bg-surface px-3 py-1.5 text-xs font-medium text-error transition-colors duration-200 hover:bg-error/10"
                      >
                        Xoá
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {capabilities.canMutateCourses ? (
        <CourseFormPopup
          open={formOpen}
          course={editingCourse}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
          canChangeSaleMode={capabilities.canChangeCourseSaleMode}
        />
      ) : null}
      {dialog}
    </div>
  );
}
