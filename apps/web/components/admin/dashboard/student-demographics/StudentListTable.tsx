"use client";

import type { StudentDemographicsStudentRow } from "@/dtos/dashboard.dto";
import { formatVnInteger } from "@/lib/formatters";

function statusLabel(status: string | null) {
  if (status === "active") return "Đang học";
  if (status === "inactive") return "Đã nghỉ";
  return status ?? "—";
}

/**
 * Bảng từng học sinh (năm sinh, tỉnh, lớp, doanh thu, tổng nạp).
 * `courseKey` có giá trị → thêm cột "DT khoá này".
 * `showRawBirthYear` → hiện năm sinh gốc trong DB (dùng cho tab rà soát).
 */
export function StudentListTable({
  students,
  courseKey,
  showRawBirthYear = false,
  emptyText = "Không có học sinh nào.",
}: {
  students: StudentDemographicsStudentRow[];
  courseKey?: string | null;
  showRawBirthYear?: boolean;
  emptyText?: string;
}) {
  if (students.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-text-muted">{emptyText}</p>;
  }

  return (
    <div className="max-h-[50vh] overflow-auto rounded-lg border border-border-default">
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-bg-secondary text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <tr>
            <th className="px-2.5 py-2">Học sinh</th>
            <th className="px-2.5 py-2 text-right">{showRawBirthYear ? "Năm sinh (DB)" : "Năm sinh"}</th>
            <th className="px-2.5 py-2">Tỉnh/TP</th>
            <th className="px-2.5 py-2">Lớp</th>
            <th className="px-2.5 py-2">Trạng thái</th>
            <th className="px-2.5 py-2 text-right">Buổi</th>
            {courseKey ? <th className="px-2.5 py-2 text-right">DT khoá này</th> : null}
            <th className="px-2.5 py-2 text-right">Tổng DT</th>
            <th className="px-2.5 py-2 text-right">Tổng nạp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default bg-bg-surface">
          {students.map((s) => (
            <tr key={s.studentId} className="hover:bg-bg-secondary/25">
              <td className="px-2.5 py-2">
                <span className="font-semibold text-text-primary">{s.fullName}</span>
                <span className="block text-[10px] text-text-muted">{s.studentId}</span>
              </td>
              <td className="px-2.5 py-2 text-right tabular-nums text-text-primary">
                {showRawBirthYear ? (
                  s.rawBirthYear ?? <span className="italic text-text-muted">trống</span>
                ) : s.birthYear != null ? (
                  <>
                    {s.birthYear}
                    <span className="text-text-muted"> · {s.age}t</span>
                  </>
                ) : (
                  <span className="italic text-text-muted">chưa có</span>
                )}
              </td>
              <td className="px-2.5 py-2 text-text-secondary">{s.province}</td>
              <td className="max-w-56 px-2.5 py-2 text-[11px] text-text-secondary">
                {s.classNames.join(", ") || "—"}
              </td>
              <td className="px-2.5 py-2 text-text-secondary">{statusLabel(s.status)}</td>
              <td className="px-2.5 py-2 text-right tabular-nums text-text-secondary">
                {formatVnInteger(s.attendanceCount)}
              </td>
              {courseKey ? (
                <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-text-primary">
                  {formatVnInteger(s.revenueByCourse[courseKey] ?? 0)}
                </td>
              ) : null}
              <td className="px-2.5 py-2 text-right tabular-nums text-text-primary">
                {formatVnInteger(s.totalRevenue)}
              </td>
              <td className="px-2.5 py-2 text-right tabular-nums text-text-secondary">
                {formatVnInteger(s.totalTopup)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
