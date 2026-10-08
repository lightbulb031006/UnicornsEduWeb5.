"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import StudentTuitionHistoryCard from "@/components/student/StudentTuitionHistoryCard";
import StudentWalletSection from "@/components/student/StudentWalletSection";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import type { StudentSelfDetail } from "@/dtos/student.dto";
import { getMyStudentDetail } from "@/lib/apis/auth.api";

/**
 * Trang nộp học phí riêng cho học sinh (`/student/tuition`): số dư + nạp tiền
 * qua QR SePay + lịch sử giao dịch. Không hiện mức học phí từng lớp. Dùng chung
 * query key `["student", "self", "detail"]` với dashboard nên không gọi thêm API.
 */
export default function StudentTuitionPage() {
  const { isLoading, isFetching, isError, error } = useQuery<StudentSelfDetail>(
    {
      queryKey: ["student", "self", "detail"],
      queryFn: getMyStudentDetail,
      retry: false,
      staleTime: 60_000,
    },
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col space-y-5 sm:space-y-6">
      <QueryRefreshStrip
        active={isFetching && !isLoading}
        label="Đang đồng bộ dữ liệu học phí mới nhất…"
        className="mb-1"
      />

      <header className="space-y-2">
        <Link
          href="/student"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Về trang học tập
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
            Học phí
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Nạp tiền vào ví học phí và theo dõi các giao dịch của bạn.
          </p>
        </div>
      </header>

      {isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-error/30 bg-error/10 px-5 py-4 shadow-sm"
        >
          <p className="text-sm font-medium text-error">
            {(error as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Không tải được thông tin học phí."}
          </p>
        </div>
      ) : null}

      <StudentWalletSection />

      <StudentTuitionHistoryCard />
    </div>
  );
}
