"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  StudentClassCardGridSkeleton,
  StudentDashboardSkeleton,
} from "@/components/student/StudentDashboardSkeleton";
import { StudentClassCard, StudentClassCardGrid } from "@/components/student/StudentClassCard";
import OjProgressSection from "@/components/student/OjProgressSection";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import type { StudentClassCardItem } from "@/dtos/student-class.dto";
import type { StudentSelfDetail } from "@/dtos/student.dto";
import { getMyStudentDetail } from "@/lib/apis/auth.api";
import { getMyClasses } from "@/lib/apis/student-class.api";
import { studentSelfKeys } from "@/lib/query-keys";

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

  const {
    data: classCards,
    isLoading: isClassesLoading,
    isFetching: isClassesFetching,
    isError: isClassesError,
  } = useQuery<StudentClassCardItem[]>({
    queryKey: studentSelfKeys.classes(),
    queryFn: getMyClasses,
    retry: false,
    staleTime: 60_000,
  });

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

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6">
      <QueryRefreshStrip
        active={(isStudentFetching || isClassesFetching) && !isClassesLoading}
        label="Đang đồng bộ dữ liệu học sinh mới nhất…"
        className="mb-1"
      />

      <section className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Lớp đang học</h1>
          <p className="text-sm text-text-muted">
            Chọn lớp học để xem lịch sử buổi học, video recording và tiết học.
          </p>
        </div>

        {isClassesLoading ? (
          <StudentClassCardGridSkeleton />
        ) : isClassesError ? (
          <div className="rounded-2xl border border-error/30 bg-error/10 px-5 py-4 text-sm font-medium text-error">
            Không tải được danh sách lớp đang học.
          </div>
        ) : classCards && classCards.length > 0 ? (
          <StudentClassCardGrid>
            {classCards.map((card) => (
              <StudentClassCard key={card.classId} card={card} />
            ))}
          </StudentClassCardGrid>
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
