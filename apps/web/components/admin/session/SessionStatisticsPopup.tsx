"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SessionItem } from "@/dtos/session.dto";
import type { ClassDetail } from "@/dtos/class.dto";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { MonthInput } from "@/components/ui/MonthInput";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import * as sessionApi from "@/lib/apis/session.api";
import * as staffOpsApi from "@/lib/apis/staff-ops.api";
import { getDefaultMonthKey, formatMonthKeyLabel } from "@/lib/month-format";

export function ClassSessionStatisticsButton({
  classDetail,
  scope,
}: {
  classDetail: ClassDetail;
  scope: "admin" | "staff";
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(getDefaultMonthKey);
  const [year, monthValue] = month.split("-");
  const { data: sessions = [], isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["math-session-statistics", scope, classDetail.id, month],
    queryFn: () => (scope === "staff" ? staffOpsApi : sessionApi).getSessionsByClassId(
      classDetail.id,
      { year, month: monthValue },
    ),
    enabled: open,
    retry: false,
  });
  useEffect(() => {
    if (error) toast.error("Không tải được thống kê buổi học. Vui lòng thử lại.");
  }, [error]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <MonthInput
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          aria-label="Tháng thống kê buổi học"
          className="sm:w-52"
        />
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
          disabled={open && isFetching}
          onClick={() => {
            setOpen(true);
            if (isError) void refetch();
          }}
        >
          {open && isFetching ? "Đang tải…" : "Thống kê buổi học"}
        </button>
      </div>
      <SessionStatisticsPopup
        open={open && !isPending && !isError}
        onClose={() => setOpen(false)}
        sessions={sessions}
        classDetail={classDetail}
        monthLabel={formatMonthKeyLabel(month)}
      />
    </>
  );
}

interface StudentSessionRow {
  index: number;
  date: string;
  startTime: string;
  endTime: string;
  tuitionFee: number;
}

interface StudentOption {
  id: string;
  fullName: string;
}

function formatDateOnly(raw?: string | null): string {
  if (!raw) return "—";
  const matched = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return "—";
  return `${matched[3]}/${matched[2]}/${matched[1]}`;
}

function formatTimeOnly(raw?: string | null): string {
  if (!raw) return "—";
  const directMatch = raw.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (directMatch) return `${directMatch[1]}:${directMatch[2]}`;
  const isoMatch = raw.trim().match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (isoMatch) return isoMatch[1];
  return "—";
}

function formatTuitionDisplay(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export interface SessionStatisticsPopupProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionItem[];
  classDetail: ClassDetail;
  monthLabel: string;
}

export default function SessionStatisticsPopup({
  open,
  onClose,
  sessions,
  classDetail,
  monthLabel,
}: SessionStatisticsPopupProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  // Extract unique students from all sessions' attendance records
  const studentOptions = useMemo<StudentOption[]>(() => {
    const map = new Map<string, string>();
    for (const session of sessions) {
      for (const att of session.attendance ?? []) {
        if (!att.studentId) continue;
        if (!map.has(att.studentId)) {
          map.set(
            att.studentId,
            att.student?.fullName?.trim() || att.studentId,
          );
        }
      }
    }
    // Fallback: if sessions have no attendance data, use classDetail students
    if (map.size === 0 && classDetail.students) {
      for (const st of classDetail.students) {
        if ((st.status ?? "active") === "active") {
          map.set(st.id, st.fullName);
        }
      }
    }
    return Array.from(map.entries()).map(([id, fullName]) => ({
      id,
      fullName,
    }));
  }, [sessions, classDetail.students]);

  // Auto-select first student when options change
  const effectiveStudentId =
    selectedStudentId && studentOptions.some((s) => s.id === selectedStudentId)
      ? selectedStudentId
      : studentOptions[0]?.id ?? "";

  const selectedStudent = studentOptions.find(
    (s) => s.id === effectiveStudentId,
  );

  // Build rows: filter sessions where this student has chargeable attendance
  const rows = useMemo<StudentSessionRow[]>(() => {
    if (!effectiveStudentId) return [];
    const result: StudentSessionRow[] = [];

    // Sort sessions by date ascending
    const sorted = [...sessions].sort((a, b) =>
      (a.date ?? "").localeCompare(b.date ?? ""),
    );

    let idx = 0;
    for (const session of sorted) {
      const att = (session.attendance ?? []).find(
        (a) => a.studentId === effectiveStudentId,
      );
      if (!att) continue;
      // Only include present or excused (chargeable)
      const status = (att.status ?? "absent").toLowerCase();
      if (status !== "present" && status !== "excused") continue;
      idx++;
      result.push({
        index: idx,
        date: formatDateOnly(session.date),
        startTime: formatTimeOnly(session.startTime),
        endTime: formatTimeOnly(session.endTime),
        tuitionFee:
          typeof att.tuitionFee === "number" ? att.tuitionFee : 0,
      });
    }
    return result;
  }, [sessions, effectiveStudentId]);

  const total = rows.reduce((sum, r) => sum + r.tuitionFee, 0);
  const typeLabel = classDetail.course?.name ?? "";

  if (!open) return null;

  return (
    <ResponsiveDialog
      size="2xl"
      className="z-[120]"
      labelledBy="session-statistics-title"
      onBackdropClick={onClose}
    >
      <div className="relative max-h-[85vh] w-full max-w-[620px] overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 id="session-statistics-title" className="text-sm font-semibold text-text-primary sm:text-base">
            Thống kê buổi học tháng
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(85vh - 60px)" }}>
          {/* Student selector (only if multiple students) */}
          {studentOptions.length > 1 ? (
            <div className="mb-4">
              <label
                htmlFor="stats-student-select"
                className="mb-1.5 block text-xs font-medium text-text-secondary"
              >
                Chọn học sinh
              </label>
              <UpgradedSelect
                ariaLabel="Chọn học sinh thống kê"
                id="stats-student-select"
                value={effectiveStudentId}
                onValueChange={(val) => setSelectedStudentId(val)}
                options={studentOptions.map((s) => ({
                  value: s.id,
                  label: s.fullName,
                }))}
              />
            </div>
          ) : null}

          {/* Sub-header: student name — class name — type */}
          {selectedStudent ? (
            <div className="mb-4 text-center">
              <p className="text-base font-bold text-text-primary sm:text-lg">
                {selectedStudent.fullName} – {classDetail.name}
                {typeLabel ? ` – ${typeLabel}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-text-muted sm:text-sm">
                {monthLabel} • Tổng: {rows.length} buổi
              </p>
            </div>
          ) : null}

          {/* Table */}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border-default">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-default bg-bg-secondary">
                    <th className="px-3 py-2 text-center text-xs font-semibold text-text-primary">
                      Buổi
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-text-primary">
                      Ngày
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-text-primary">
                      Thời gian bắt đầu
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-text-primary">
                      Thời gian kết thúc
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-primary">
                      Giá
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.index}
                      className="border-b border-border-default bg-bg-surface transition-colors hover:bg-bg-secondary/40"
                    >
                      <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                        {row.index}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                        {row.date}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                        {row.startTime}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                        {row.endTime}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                        {formatTuitionDisplay(row.tuitionFee)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border-default bg-bg-secondary/60">
                    <td
                      colSpan={4}
                      className="px-3 py-2.5 text-left text-sm font-bold text-text-primary"
                    >
                      Tổng cộng
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-primary">
                      {formatTuitionDisplay(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-default bg-bg-secondary/50 px-4 py-8 text-center text-sm text-text-muted">
              {studentOptions.length === 0
                ? "Chưa có dữ liệu điểm danh trong tháng này."
                : "Học sinh không có buổi học nào trong tháng này."}
            </div>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
