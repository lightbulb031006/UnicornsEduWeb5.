"use client";

import { useState } from "react";

import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";

type TimelineSurvey = NonNullable<ClassTimelineItemDto["survey"]>;

function formatSurveyDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN");
}

function renderSurveyName(survey: TimelineSurvey) {
  return (
    survey.surveyName?.trim() ||
    (survey.testNumber ? `Lần ${survey.testNumber}` : "—")
  );
}

/** Tóm tắt ngắn khi chưa có nội dung đánh giá kiến thức để hiện. */
function renderFallbackSummary(survey: TimelineSurvey) {
  const count = survey.studentCount ?? 0;
  if (count > 0) return `${count} học sinh có nhận xét`;
  return "Chưa có đánh giá";
}

export default function SurveyTimelineCard({
  survey,
}: {
  survey: TimelineSurvey;
}) {
  const [expanded, setExpanded] = useState(false);
  const assessment = survey.knowledgeAssessment?.trim() ?? "";

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-text-muted">
            Bài khảo sát
          </p>
          <p className="truncate text-sm font-semibold text-text-primary">
            {renderSurveyName(survey)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-text-muted">
            Ngày báo cáo
          </p>
          <p className="text-sm text-text-primary">
            {formatSurveyDate(survey.reportDate)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-text-muted">
            Người phụ trách
          </p>
          <p className="truncate text-sm text-text-primary">
            {survey.teacher?.fullName || "—"}
          </p>
        </div>
      </div>

      <div className="border-t border-border-subtle pt-2">
        {assessment ? (
          <>
            <p
              className={`whitespace-pre-wrap break-words text-xs text-text-secondary ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {assessment}
            </p>
            <button
              type="button"
              className="mt-1 text-[11px] font-medium text-primary hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((prev) => !prev);
              }}
            >
              {expanded ? "Thu gọn" : "Xem thêm"}
            </button>
          </>
        ) : (
          <p className="text-xs text-text-muted">
            {renderFallbackSummary(survey)}
          </p>
        )}
      </div>
    </div>
  );
}
