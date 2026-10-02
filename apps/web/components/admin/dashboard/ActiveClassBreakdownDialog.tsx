"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { getAdminActiveClassBreakdown } from "@/lib/apis/dashboard.api";
import { formatVnInteger } from "@/lib/formatters";

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data
      ?.message === "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data
      ?.message as string;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Không thể tải phân loại lớp.";
}

export function ActiveClassBreakdownDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const breakdownQuery = useQuery({
    queryKey: ["dashboard", "admin", "active-class-breakdown"],
    queryFn: getAdminActiveClassBreakdown,
    staleTime: 20_000,
  });

  const data = breakdownQuery.data;
  const rowStudentTotal =
    data?.items.reduce((sum, item) => sum + item.studentCount, 0) ?? 0;
  const studentsOverlapCourses = data != null && rowStudentTotal > data.studentCount;

  return (
    <ResponsiveDialog labelledBy={titleId} onBackdropClick={onClose} size="lg">
      <div className="flex items-start justify-between gap-3 border-b border-border-default px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-balance text-text-primary">
            Lớp đang học
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Phân loại theo khoá học. Số liệu hiện tại, không theo tháng đang chọn.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label="Đóng phân loại lớp"
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ResponsiveDialogBody className="p-4 sm:p-5">
        {breakdownQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-bg-secondary/40" />
            ))}
          </div>
        ) : breakdownQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được phân loại lớp</AlertTitle>
            <AlertDescription>{getErrorMessage(breakdownQuery.error)}</AlertDescription>
          </Alert>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-text-secondary">Chưa có lớp nào đang hoạt động.</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border-default bg-bg-secondary/25 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Loại lớp</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                  {formatVnInteger(data.courseTypeCount)}
                </dd>
              </div>
              <div className="rounded-xl border border-border-default bg-bg-secondary/25 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Lớp</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                  {formatVnInteger(data.classCount)}
                </dd>
              </div>
              <div className="rounded-xl border border-border-default bg-bg-secondary/25 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Học sinh</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                  {formatVnInteger(data.studentCount)}
                </dd>
              </div>
            </dl>

            <ul className="divide-y divide-border-default rounded-xl border border-border-default">
              {data.items.map((item) => (
                <li
                  key={item.courseId}
                  className="flex items-center justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{item.courseName}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {formatVnInteger(item.classCount)} lớp đang chạy
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="text-lg font-semibold tabular-nums text-text-primary">
                      {formatVnInteger(item.studentCount)}
                    </span>
                    <span className="block text-xs text-text-muted">học sinh</span>
                  </p>
                </li>
              ))}
            </ul>

            {studentsOverlapCourses ? (
              <p className="text-xs text-text-secondary">
                Học sinh học nhiều khoá được tính ở từng dòng. Tổng học sinh là số người không trùng.
              </p>
            ) : null}
          </div>
        )}
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
