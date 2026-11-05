"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatScoreValue } from "@/lib/attempt-score";
import { IT_POINTS, type ItExamBreakdown } from "@/lib/exam-layout";

/** Thang điểm đề tốt nghiệp THPT Tin, đơn vị 1/100. */
const IT_FULL_SCORE = 1000;

function points(value: number) {
  return `${formatScoreValue(value, "absolute_it")}đ`;
}

function StatTile({
  title,
  count,
  detail,
}: {
  title: string;
  count: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-primary px-3 py-2">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-text-primary">
        {count} <span className="text-xs font-normal text-text-secondary">câu</span>
      </p>
      <p className="text-xs text-text-secondary">{detail}</p>
    </div>
  );
}

/**
 * Tổng quan cấu trúc đề IT: số câu từng phần, điểm tối đa so với thang 10 và
 * cảnh báo sai form nhóm tự chọn.
 */
export function ExamStructureSummary({
  breakdown,
  formWarning,
  showElectives,
}: {
  breakdown: ItExamBreakdown;
  formWarning: string | null | undefined;
  showElectives: boolean;
}) {
  const diff = breakdown.maxPoints - IT_FULL_SCORE;
  const full = diff === 0;
  const electiveCount = Math.max(breakdown.elective1, breakdown.elective2);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          showElectives ? "lg:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        <StatTile
          title="Phần I · Trắc nghiệm"
          count={breakdown.part1}
          detail={points(breakdown.part1 * IT_POINTS.single_choice)}
        />
        <StatTile
          title="Phần II · Bắt buộc"
          count={breakdown.required2}
          detail={points(breakdown.required2 * IT_POINTS.true_false_group)}
        />
        {showElectives ? (
          <StatTile
            title="Phần II · Tự chọn"
            count={electiveCount}
            detail={`TC1: ${breakdown.elective1} · TC2: ${breakdown.elective2} — ${points(electiveCount * IT_POINTS.true_false_group)}`}
          />
        ) : null}
        <div
          className={cn(
            "rounded-lg border px-3 py-2",
            showElectives ? "" : "col-span-2 sm:col-span-1",
            full
              ? "border-success/30 bg-success/10"
              : "border-warning/40 bg-warning/10",
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Điểm tối đa
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold text-text-primary">
            {full ? (
              <CheckCircle2 className="size-4 text-success" aria-hidden />
            ) : (
              <AlertTriangle className="size-4 text-warning" aria-hidden />
            )}
            {formatScoreValue(breakdown.maxPoints, "absolute_it")}
            <span className="text-xs font-normal text-text-secondary">/ 10</span>
          </p>
          <p className="text-xs text-text-secondary">
            {full
              ? "Đủ thang 10 điểm."
              : diff < 0
                ? `Thiếu ${points(-diff)} so với thang 10.`
                : `Vượt ${points(diff)} so với thang 10.`}
          </p>
        </div>
      </div>
      {formWarning ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text-primary"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          {formWarning}
        </p>
      ) : null}
    </div>
  );
}
