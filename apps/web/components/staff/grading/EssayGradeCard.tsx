"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import MathContent from "@/components/ui/MathContent";
import type { EssayGradingQueueItemDto } from "@/dtos/essay-grading.dto";
import { formatVnDayMonthTime } from "@/lib/formatters";
import {
  CONTENT_LIMITS,
  overLimitMessage,
} from "@/dtos/content-limits";

function formatDateTime(iso: string): string {
  try {
    return formatVnDayMonthTime(new Date(iso));
  } catch {
    return iso;
  }
}

export default function EssayGradeCard({
  item,
  isSaving,
  onSkip,
  onSave,
}: {
  item: EssayGradingQueueItemDto;
  isSaving: boolean;
  onSkip: () => void;
  onSave: (payload: { pointsAwarded: number; feedback: string | null }) => void;
}) {
  // Component được remount theo key={attemptAnswerId} ở trang cha nên state tự
  // reset khi chuyển sang câu / học sinh khác trong hàng đợi.
  const [points, setPoints] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const pointsError = useMemo(() => {
    if (points.trim() === "") return "Chưa nhập điểm";
    const value = Number(points);
    if (!Number.isInteger(value) || value < 0)
      return "Điểm phải là số nguyên không âm";
    if (value > item.pointsPossible) return "Điểm vượt thang";
    return null;
  }, [points, item.pointsPossible]);

  const feedbackError =
    feedback.length > CONTENT_LIMITS.feedback
      ? overLimitMessage("Nhận xét", CONTENT_LIMITS.feedback)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl border border-primary/25 bg-primary/5 p-3.5 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="font-semibold text-text-primary">
            Đang chấm lượt làm mới nhất của {item.studentName}
          </p>
          <p className="mt-0.5 text-text-secondary">
            Học sinh làm {item.studentAttemptCount} lượt; chỉ lượt gần nhất (
            {formatDateTime(item.attemptSubmittedAt)}) vào hàng đợi chấm.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            Câu {item.questionOrder}/{item.totalQuestions}
          </span>
          <span className="inline-flex items-center rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">
            {item.difficultyLabel}
          </span>
          <span className="ml-auto text-xs text-text-muted">
            Tối đa {item.pointsPossible}/100 điểm
          </span>
        </div>

        <MathContent
          content={item.questionContent}
          className="block text-sm text-text-primary"
        />

        <div className="mt-3 rounded-r-lg border-l-[3px] border-primary bg-bg-secondary px-3 py-2.5 text-sm text-text-primary">
          {item.essayAnswer?.trim() ? (
            <MathContent content={item.essayAnswer} className="block" />
          ) : (
            <p className="italic text-text-muted">Học sinh không trả lời câu này.</p>
          )}
        </div>

        {item.answerGuide?.trim() && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showGuide ? "Ẩn barem" : "Xem barem"}
            </button>
            {showGuide && (
              <div className="mt-2 rounded-lg bg-bg-secondary/60 p-2.5">
                <MathContent
                  content={item.answerGuide}
                  className="block text-xs text-text-secondary"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="essay-points"
            className="mb-1 block text-sm font-medium text-text-primary"
          >
            Điểm chấm
          </label>
          <div className="flex items-center gap-2">
            <input
              id="essay-points"
              type="number"
              inputMode="numeric"
              min={0}
              max={item.pointsPossible}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-20 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-right text-sm tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
            <span className="text-sm text-text-muted">/ {item.pointsPossible}</span>
          </div>
          {pointsError ? (
            <p className="mt-1 text-xs text-error">{pointsError}</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="essay-feedback"
            className="mb-1 block text-sm font-medium text-text-primary"
          >
            Nhận xét cho học sinh
          </label>
          <textarea
            id="essay-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="Không bắt buộc"
            className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          {feedbackError && (
            <p className="mt-1 text-xs text-error">{feedbackError}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSkip}
          disabled={isSaving}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
        >
          Bỏ qua
        </button>
        <button
          type="button"
          disabled={isSaving || pointsError !== null || feedbackError !== null}
          onClick={() =>
            onSave({
              pointsAwarded: Number(points),
              feedback: feedback.trim() ? feedback.trim() : null,
            })
          }
          className="ml-auto inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? "Đang lưu..." : "Lưu & chấm bài tiếp theo"}
        </button>
      </div>
      {pointsError && !isSaving ? (
        <p className="text-right text-xs text-error">{pointsError}</p>
      ) : null}
    </div>
  );
}
