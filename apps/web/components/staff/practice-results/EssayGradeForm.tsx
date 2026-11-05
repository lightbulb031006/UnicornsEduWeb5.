"use client";

import { useEffect, useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AttemptScoringDto } from "@/dtos/attempt.dto";
import type { StaffAttemptQuestionDto } from "@/dtos/practice-stats.dto";
import { CONTENT_LIMITS, overLimitMessage } from "@/dtos/content-limits";
import { gradeEssayAnswer } from "@/lib/apis/essay-grading.api";
import {
  formatScoreValue,
  parseScoreInput,
  scoreInputValue,
} from "@/lib/attempt-score";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { cn } from "@/lib/utils";

function pointsError(
  text: string,
  max: number,
  scoring: AttemptScoringDto,
): string | null {
  if (text.trim() === "") return "Chưa nhập điểm";
  const value = parseScoreInput(text, scoring);
  if (value === null) {
    return scoring === "absolute_it"
      ? "Điểm không âm, tối đa 2 chữ số thập phân"
      : "Điểm phải là số nguyên không âm";
  }
  if (value > max) return `Điểm vượt thang (tối đa ${formatScoreValue(max, scoring)})`;
  return null;
}

/**
 * Form chấm một câu tự luận ngay dưới câu trên màn Bài làm. Giá trị ban đầu lấy
 * từ props, nên refetch sau khi lưu tự đưa form về trạng thái sạch.
 */
export default function EssayGradeForm({
  classId,
  assignmentId,
  question,
  label,
  scoring,
  onDirtyChange,
  onSaved,
}: {
  classId: string;
  assignmentId: string;
  question: StaffAttemptQuestionDto;
  /** Nhãn câu hiển thị ("3", "II.2"…). */
  label: string;
  scoring: AttemptScoringDto;
  onDirtyChange: (attemptAnswerId: string, dirty: boolean) => void;
  onSaved: (question: StaffAttemptQuestionDto) => Promise<void>;
}) {
  const fieldId = useId();
  const graded = question.pointsAwarded != null;
  const initialPoints = scoreInputValue(question.pointsAwarded, scoring);
  const initialFeedback = question.feedback ?? "";
  const [points, setPoints] = useState(initialPoints);
  const [feedback, setFeedback] = useState(initialFeedback);
  const dirty = points !== initialPoints || feedback !== initialFeedback;
  const { attemptAnswerId } = question;

  useEffect(() => {
    onDirtyChange(attemptAnswerId, dirty);
  }, [attemptAnswerId, dirty, onDirtyChange]);
  useEffect(
    () => () => onDirtyChange(attemptAnswerId, false),
    [attemptAnswerId, onDirtyChange],
  );

  const pError = pointsError(points, question.pointsPossible, scoring);
  const fError =
    feedback.length > CONTENT_LIMITS.feedback
      ? overLimitMessage("Nhận xét", CONTENT_LIMITS.feedback)
      : null;
  const showPointsError = pError !== null && points.trim() !== "";

  const mutation = useMutation({
    mutationFn: () =>
      gradeEssayAnswer(classId, assignmentId, attemptAnswerId, {
        pointsAwarded: parseScoreInput(points, scoring) ?? 0,
        feedback: feedback.trim() ? feedback.trim() : null,
      }),
    onSuccess: () => onSaved(question),
    onError: (error) => {
      toast.error(getMutationErrorMessage(error, "Không lưu được điểm."));
    },
  });

  const canSave =
    !mutation.isPending && pError === null && fError === null && (dirty || !graded);
  const save = () => {
    if (canSave) mutation.mutate();
  };

  const quick = (value: number) => setPoints(scoreInputValue(value, scoring));

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        graded && !dirty
          ? "border-border-default bg-bg-secondary/40"
          : "border-primary/40 bg-primary/5",
      )}
    >
      <p className="mb-3 text-sm font-semibold text-text-primary">
        Chấm câu {label}
        {graded && !dirty ? (
          <span className="ml-2 text-xs font-normal text-success">Đã chấm</span>
        ) : null}
      </p>
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <label
            htmlFor={`${fieldId}-points`}
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Điểm
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${fieldId}-points`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              aria-invalid={showPointsError}
              className="h-11 w-20 rounded-xl border border-border-default bg-bg-surface px-3 text-right text-sm tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
            <span className="text-sm text-text-muted">
              / {formatScoreValue(question.pointsPossible, scoring)}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => quick(0)}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => quick(question.pointsPossible)}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
            >
              Tối đa
            </button>
          </div>
          {showPointsError ? (
            <p className="mt-1 text-xs text-error">{pError}</p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor={`${fieldId}-feedback`}
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Nhận xét cho học sinh
          </label>
          <textarea
            id={`${fieldId}-feedback`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="Không bắt buộc"
            className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          {fError ? <p className="mt-1 text-xs text-error">{fError}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
        >
          {mutation.isPending ? "Đang lưu..." : graded ? "Cập nhật điểm" : "Lưu điểm"}
        </button>
      </div>
    </div>
  );
}
