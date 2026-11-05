"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminDashboardStudentChurnType, AdminDashboardSummary } from "@/dtos/dashboard.dto";
import { getAdminActiveClassBreakdown } from "@/lib/apis/dashboard.api";
import { formatVnInteger } from "@/lib/formatters";
import { DashboardPanel } from "./DashboardPanel";

const COURSE_PREVIEW_LIMIT = 6;

export function StudentClassSection({
  summary,
  dimmed,
  onOpenChurn,
  onOpenClassBreakdown,
}: {
  summary: AdminDashboardSummary;
  dimmed?: boolean;
  onOpenChurn: (tab: AdminDashboardStudentChurnType) => void;
  onOpenClassBreakdown: () => void;
}) {
  const breakdownQuery = useQuery({
    queryKey: ["dashboard", "admin", "active-class-breakdown"],
    queryFn: getAdminActiveClassBreakdown,
    staleTime: 20_000,
  });

  const churnTiles: {
    tab: AdminDashboardStudentChurnType;
    label: string;
    value: string;
    valueClass: string;
  }[] = [
    { tab: "active", label: "Đang học", value: formatVnInteger(summary.activeStudents), valueClass: "text-text-primary" },
    { tab: "new", label: "Học sinh mới", value: `+${formatVnInteger(summary.newStudentsThisMonth)}`, valueClass: "text-success" },
    { tab: "dropped", label: "Cũ nghỉ", value: `−${formatVnInteger(summary.droppedStudentsThisMonth)}`, valueClass: summary.droppedStudentsThisMonth > 0 ? "text-error" : "text-text-primary" },
    { tab: "trial_dropped", label: "Thử nghỉ", value: `−${formatVnInteger(summary.trialDroppedStudentsThisMonth)}`, valueClass: summary.trialDroppedStudentsThisMonth > 0 ? "text-warning" : "text-text-primary" },
  ];

  const courses = [...(breakdownQuery.data?.items ?? [])].sort((a, b) => b.classCount - a.classCount);
  const visibleCourses = courses.slice(0, COURSE_PREVIEW_LIMIT);

  return (
    <DashboardPanel
      title="Học sinh & lớp"
      description="Biến động theo tháng đang chọn · lớp là số hiện tại"
      dimmed={dimmed}
    >
      <div className="grid grid-cols-2 gap-2">
        {churnTiles.map((tile) => (
          <button
            key={tile.tab}
            type="button"
            onClick={() => onOpenChurn(tile.tab)}
            className="flex min-h-11 flex-col items-start gap-0.5 rounded-xl border border-border-default bg-bg-secondary/40 p-3 text-left transition-colors hover:border-primary/30 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <span className="text-xs text-text-secondary">{tile.label}</span>
            <span className={`text-xl font-bold tabular-nums ${tile.valueClass}`}>{tile.value}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border-default">
        <button
          type="button"
          onClick={onOpenClassBreakdown}
          className="flex w-full items-center justify-between gap-2 bg-bg-secondary/40 px-3 py-2 text-left text-xs font-semibold text-text-secondary hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
        >
          <span>
            {formatVnInteger(summary.activeClasses)} lớp đang hoạt động theo khoá học
          </span>
          <span className="text-primary">Xem tất cả</span>
        </button>
        {breakdownQuery.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-8 animate-pulse rounded-md bg-bg-secondary/40" />
            ))}
          </div>
        ) : breakdownQuery.isError ? (
          <p className="px-3 py-3 text-sm text-error">Không tải được phân loại lớp.</p>
        ) : visibleCourses.length === 0 ? (
          <p className="px-3 py-3 text-sm text-text-secondary">Chưa có lớp nào đang hoạt động.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border-default text-left text-xs text-text-secondary">
                <th scope="col" className="px-3 py-2 font-semibold">Khoá học</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Lớp</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Học sinh</th>
              </tr>
            </thead>
            <tbody>
              {visibleCourses.map((course) => (
                <tr
                  key={course.courseId ?? course.courseName}
                  onClick={onOpenClassBreakdown}
                  className="cursor-pointer border-t border-border-default hover:bg-bg-secondary/50"
                >
                  <td className="px-3 py-2 text-text-primary">{course.courseName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatVnInteger(course.classCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatVnInteger(course.studentCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardPanel>
  );
}
