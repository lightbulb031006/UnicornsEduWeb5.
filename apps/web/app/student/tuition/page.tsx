"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import StudentTuitionClassList from "@/components/student/StudentTuitionClassList";
import StudentTuitionHistoryCard from "@/components/student/StudentTuitionHistoryCard";
import StudentWalletSection from "@/components/student/StudentWalletSection";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudentSelfDetail } from "@/dtos/student.dto";
import { getMyStudentDetail } from "@/lib/apis/auth.api";

/**
 * Trang nộp học phí riêng cho học sinh (`/student/tuition`): số dư + nạp tiền
 * qua QR SePay + lịch sử giao dịch + mức học phí từng lớp. Dùng chung query key
 * `["student", "self", "detail"]` với dashboard nên không gọi thêm API.
 */
export default function StudentTuitionPage() {
  const {
    data: student,
    isLoading,
    isFetching,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6">
      <QueryRefreshStrip
        active={isFetching && !isLoading}
        label="Đang đồng bộ dữ liệu học phí mới nhất…"
        className="mb-1"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text-primary sm:text-2xl">
          Học phí
        </h1>
        <Link
          href="/student"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Về trang học tập
        </Link>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-error/30 bg-error/10 px-5 py-6 shadow-sm">
          <p className="text-sm font-medium text-error">
            {(error as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Không tải được thông tin học phí."}
          </p>
        </div>
      ) : null}

      <StudentWalletSection />

      <section className="space-y-4 rounded-2xl border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary">
            Học phí theo lớp
          </h2>
          <p className="text-sm text-text-muted">
            Mức học phí đang áp dụng cho từng lớp bạn đang theo học.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : (
          <StudentTuitionClassList classItems={classItems} />
        )}
      </section>

      <StudentTuitionHistoryCard />
    </div>
  );
}
