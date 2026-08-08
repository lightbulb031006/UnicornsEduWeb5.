"use client";

import { useMemo, useState } from "react";
import type { SessionItem } from "@/dtos/session.dto";
import type { ClassDetail, ClassType } from "@/dtos/class.dto";
import { formatCurrency } from "@/lib/class.helpers";
import UpgradedSelect from "@/components/ui/UpgradedSelect";

const TYPE_LABELS: Record<ClassType, string> = {
  basic: "Cơ bản",
  vip: "VIP",
  advance: "Advance",
  hardcore: "Hardcore",
};

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
  const typeLabel =
    TYPE_LABELS[classDetail.type as ClassType] ?? classDetail.type ?? "";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Thống kê buổi học tháng"
    >
      <div className="relative max-h-[85vh] w-full max-w-[620px] overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text-primary sm:text-base">
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
    </div>
  );
}
