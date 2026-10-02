"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentDashboardSkeleton } from "@/components/student/StudentDashboardSkeleton";
import OjProgressSection from "@/components/student/OjProgressSection";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import type { StudentSelfDetail, StudentStatus } from "@/dtos/student.dto";
import { getMyStudentDetail } from "@/lib/apis/auth.api";
import {
  formatTuitionPackage,
  formatTuitionPerSession,
  getClassStatusLabel,
  getTuitionSourceClass,
  getTuitionSourceLabel,
} from "@/lib/student-tuition.helpers";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Đang học",
  inactive: "Ngừng theo dõi",
};

function normalizeStatus(status?: StudentStatus): StudentStatus {
  return status === "inactive" ? "inactive" : "active";
}

export default function StudentSelfPage() {
  const {
    data: student,
    isLoading,
    isFetching: isStudentFetching,
    isError,
    error,
  } = useQuery<StudentSelfDetail>({
    queryKey: ["student", "self", "detail"],
    queryFn: getMyStudentDetail,
    retry: false,
    staleTime: 60_000,
  });

  const classItems = useMemo(
    () =>
      (student?.studentClasses ?? []).toSorted((a, b) =>
        (a.class?.name ?? "").localeCompare(b.class?.name ?? "", "vi"),
      ),
    [student],
  );

  if (isLoading) {
    return <StudentDashboardSkeleton />;
  }

  if (isError || !student) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      "Không tải được thông tin học sinh hiện tại.";

    return (
      <div className="rounded-[1.75rem] border border-error/30 bg-error/10 px-5 py-6 shadow-sm">
        <p className="text-sm font-medium text-error">{message}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Về trang chủ
          </Link>
          <Link
            href="/user-profile"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Xem hồ sơ cá nhân
          </Link>
        </div>
      </div>
    );
  }

  const normalizedStatus = normalizeStatus(student.status);
  const initials = (student.fullName?.trim() || student.email || "?").charAt(0).toUpperCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6">
      <QueryRefreshStrip
        active={isStudentFetching && !isLoading}
        label="Đang đồng bộ dữ liệu học sinh mới nhất…"
        className="mb-1"
      />

      {/* Main Student Header banner */}
      <header className="rounded-2xl border border-border-default bg-bg-surface p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl sm:text-2xl font-bold text-primary ring-2 ring-primary/20"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">
                  {student.fullName || "Học sinh"}
                </h1>
                <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success ring-1 ring-success/20">
                  {STATUS_LABELS[normalizedStatus]}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-muted truncate">
                {student.email || "Chưa có email tài khoản"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/user-profile"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none"
            >
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Hồ sơ & Lịch thi
            </Link>
            <Link
              href="/student/tuition"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h4m-7 4h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Học phí
            </Link>
          </div>
        </div>
      </header>

      {/* Enrolled Classes List */}
      <section className="rounded-2xl border border-border-default bg-bg-surface p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Danh sách lớp học</h2>
            <p className="text-sm text-text-muted">
              Chọn lớp học để xem lịch sử buổi học, video recording và tiết học.
            </p>
          </div>
        </div>

        {classItems.length > 0 ? (
          <div className="grid gap-3 sm:gap-4">
            {classItems.map((item) => (
              <Link
                key={item.class.id}
                href={`/student/classes/${item.class.id}`}
                className="group relative flex flex-col gap-3 rounded-xl border border-border-default bg-bg-secondary/40 p-4 transition-[color,background-color,border-color,box-shadow] duration-200 hover:border-primary/50 hover:bg-bg-secondary hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={cn(
                      "mt-1.5 size-2.5 shrink-0 rounded-full",
                      item.class.status === "running" ? "bg-success" : "bg-text-muted",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                        {item.class.name}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1",
                          getTuitionSourceClass(item.tuitionPackageSource),
                        )}
                      >
                        {getTuitionSourceLabel(item.tuitionPackageSource)}
                      </span>
                      <span className="inline-flex rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-muted">
                        {getClassStatusLabel(item.class.status)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                      <div>
                        <span className="text-text-muted">Học phí: </span>
                        <span className="font-semibold text-text-primary">
                          {formatTuitionPerSession(item.effectiveTuitionPerSession)}/buổi
                        </span>
                      </div>
                      <span className="text-border-default" aria-hidden>•</span>
                      <div>
                        <span className="text-text-muted">Gói học phí: </span>
                        <span className="font-medium text-text-primary">
                          {formatTuitionPackage(item)}
                        </span>
                      </div>
                      <span className="text-border-default" aria-hidden>•</span>
                      <div>
                        <span className="text-text-muted">Đã vào học: </span>
                        <span className="font-semibold text-text-primary">
                          {item.totalAttendedSession ?? 0} buổi
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-border-subtle sm:border-t-0">
                  <span className="text-xs font-semibold text-primary group-hover:underline inline-flex items-center gap-1">
                    Vào lớp học
                    <svg className="size-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/30 p-8 text-center">
            <div className="size-12 rounded-full bg-bg-tertiary text-text-muted mx-auto flex items-center justify-center mb-3">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-text-primary">
              Bạn chưa có lớp học nào
            </p>
            <p className="mt-1 text-xs text-text-muted max-w-sm mx-auto">
              Khi trung tâm phân công lớp học, danh sách lớp sẽ tự động hiển thị tại đây.
            </p>
          </div>
        )}
      </section>

      {/* Online Judge section */}
      <OjProgressSection studentName={student.fullName ?? ""} />
    </div>
  );
}
