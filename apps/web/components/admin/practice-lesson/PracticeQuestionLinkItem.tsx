"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import * as classApi from "@/lib/apis/class.api";
import { cn } from "@/lib/utils";
import MathContent from "@/components/ui/MathContent";
import { Badge } from "@/components/ui/badge";
import type { ConfirmRequest } from "@/components/ui/ConfirmDialog";
import QuestionFormDialog from "@/components/admin/question/QuestionFormDialog";
import { QuestionSlotSelect } from "@/components/admin/ElectiveGroupSettings";
import type { QuestionLink } from "@/dtos/course-content.dto";
import type { QuestionSlotDto } from "@/dtos/attempt.dto";
import { numberBlanks } from "@/lib/fill-blank";
import { itExamPart } from "@/lib/exam-layout";
import {
  QuestionTypeDto,
  TRUE_FALSE_STATEMENT_LABELS,
  questionTypeLabel,
  trueFalseChoiceLabels,
} from "@/dtos/question.dto";

const ASSIGNED_CONFIRM = {
  title: "Đề đã giao cho lớp",
  confirmLabel: "Tiếp tục",
  variant: "destructive",
} as const;

function IconButton({
  label,
  tone = "primary",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-text-muted transition-colors disabled:pointer-events-none disabled:opacity-30 sm:size-8",
        tone === "danger"
          ? "hover:bg-error/10 hover:text-error"
          : "hover:bg-primary/10 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

/** Một câu trong đề: nội dung, đáp án, vị trí câu, điểm và thao tác soạn đề. */
export function PracticeQuestionLinkItem({
  link,
  label,
  lessonId,
  courseId,
  canEdit,
  assigned,
  hasElectives,
  isAbsolute,
  weighted,
  compact,
  canMoveUp,
  canMoveDown,
  onMove,
  confirm,
  onSaved,
}: {
  link: QuestionLink;
  /** Nhãn theo bố cục đề, vd "Câu 3". */
  label: string;
  lessonId: string;
  courseId: string;
  canEdit: boolean;
  assigned: boolean;
  hasElectives: boolean;
  /** Điểm tuyệt đối (IT): điểm theo loại câu, không sửa điểm từng câu. */
  isAbsolute: boolean;
  /** Hồ sơ JP: `points` là trọng số (≥ 1, trống = 1), đề chia 100 theo trọng số. */
  weighted: boolean;
  /** Chế độ xem gọn: cắt ngắn đề bài, ẩn phương án/lời giải. */
  compact: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  confirm: (opts: ConfirmRequest) => Promise<boolean>;
  onSaved: () => void;
}) {
  const [editingPoints, setEditingPoints] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [pointsDraft, setPointsDraft] = useState(
    () => link.points?.toString() ?? "",
  );

  const confirmIfAssigned = async (description: string) =>
    !assigned || confirm({ ...ASSIGNED_CONFIRM, description });

  /**
   * Sửa câu hỏi là sửa **bản gốc trong ngân hàng**: mọi đề khác dùng chung câu
   * này đổi theo. Bài đã nộp không đổi — chấm điểm đọc snapshot trong
   * `attempt_answers` (ADR `2026-09-07-attempt-exam-snapshot`).
   */
  const openQuestionForm = async () => {
    const ok = await confirmIfAssigned(
      "Sửa câu hỏi sẽ đổi cả bản gốc trong ngân hàng và mọi đề khác đang dùng câu này. Bài học sinh đã nộp giữ nguyên nội dung cũ. Tiếp tục?",
    );
    if (ok) setShowQuestionForm(true);
  };

  const savePoints = async () => {
    const points = pointsDraft === "" ? null : parseInt(pointsDraft, 10);
    const minPoints = weighted ? 1 : 0;
    if (points !== null && (isNaN(points) || points < minPoints)) {
      toast.error(
        weighted
          ? "Trọng số phải là số nguyên >= 1"
          : "Điểm phải là số nguyên >= 0",
      );
      return;
    }
    const ok = await confirmIfAssigned(
      weighted
        ? "Trọng số mới chỉ áp cho bài làm bắt đầu sau khi lưu; bài đã bắt đầu giữ điểm cũ. Tiếp tục?"
        : "Thay đổi điểm sẽ ảnh hưởng đến lần giao đang chạy. Tiếp tục?",
    );
    if (!ok) return;
    setEditingPoints(false);
    runBackgroundSave({
      loadingMessage: "Đang lưu...",
      successMessage: "Đã cập nhật.",
      errorMessage: "Không thể cập nhật.",
      action: () =>
        classApi.updatePracticeLessonQuestion(lessonId, link.id, { points }),
      onSuccess: onSaved,
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Xóa câu hỏi khỏi đề?",
      description: assigned
        ? "Đề này đã được giao cho lớp. Xóa câu hỏi sẽ ảnh hưởng đến lần giao đang chạy. Xóa câu hỏi này khỏi đề?"
        : "Câu hỏi vẫn còn trong ngân hàng, chỉ bị gỡ khỏi đề này.",
      confirmLabel: "Xóa",
      variant: "destructive",
    });
    if (!ok) return;
    runBackgroundSave({
      loadingMessage: "Đang xóa...",
      successMessage: "Đã xóa.",
      errorMessage: "Không thể xóa.",
      action: () => classApi.removePracticeLessonQuestion(lessonId, link.id),
      onSuccess: onSaved,
    });
  };

  const saveSlot = async (slot: QuestionSlotDto) => {
    if (slot === link.slot) return;
    const ok = await confirmIfAssigned(
      "Đổi vị trí câu sẽ ảnh hưởng đến lần giao đang chạy. Tiếp tục?",
    );
    if (!ok) return;
    runBackgroundSave({
      loadingMessage: "Đang lưu...",
      successMessage: "Đã đổi vị trí câu.",
      errorMessage: "Không thể đổi vị trí câu.",
      action: () =>
        classApi.updatePracticeLessonQuestion(lessonId, link.id, { slot }),
      onSuccess: onSaved,
    });
  };

  const { question } = link;
  // Câu của bộ: đổi chỗ / gỡ theo cả bộ ở đầu khối, không lẻ từng câu.
  const inSet = Boolean(question.sharedMaterialId);
  const isChoice = question.type === QuestionTypeDto.single_choice;
  const isTrueFalse = question.type === QuestionTypeDto.true_false_group;
  const singleTfKey =
    question.type === QuestionTypeDto.true_false
      ? question.tfAnswerKey?.[0]
      : undefined;
  const options = Array.isArray(question.options) ? question.options : [];
  const solution =
    question.type === QuestionTypeDto.essay
      ? question.answerGuide
      : question.explanation;

  return (
    <li className="rounded-lg border border-border-default bg-bg-surface shadow-xs transition-colors hover:border-border-focus/40">
      <div className="flex items-center gap-2 border-b border-border-default/60 px-3 py-1.5">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
          {label}
        </span>
        <Badge variant="secondary" className="hidden min-[400px]:inline-flex">
          {questionTypeLabel(question.type)}
        </Badge>
        {isAbsolute ? (
          <Badge variant="outline">
            {itExamPart(question.type) === "II" ? "1 điểm" : "0,25 điểm"}
          </Badge>
        ) : null}
        {canEdit ? (
          <div className="ml-auto flex items-center">
            {inSet ? null : (
              <>
                <IconButton
                  label="Đưa câu lên trên"
                  disabled={!canMoveUp}
                  onClick={() => onMove(-1)}
                >
                  <ChevronUp className="size-4" />
                </IconButton>
                <IconButton
                  label="Đưa câu xuống dưới"
                  disabled={!canMoveDown}
                  onClick={() => onMove(1)}
                >
                  <ChevronDown className="size-4" />
                </IconButton>
              </>
            )}
            <IconButton
              label="Sửa câu hỏi trong ngân hàng"
              onClick={() => void openQuestionForm()}
            >
              <Pencil className="size-4" />
            </IconButton>
            {inSet ? null : (
              <IconButton
                label="Xóa câu hỏi khỏi đề"
                tone="danger"
                onClick={() => void remove()}
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
        ) : null}
      </div>

      <div className="px-3 py-2.5">
        <div
          className={cn(
            "text-sm text-text-primary",
            compact &&
              "max-h-24 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]",
          )}
        >
          <MathContent
            content={
              question.type === QuestionTypeDto.fill_blank
                ? numberBlanks(question.content)
                : question.content
            }
          />
        </div>

        {!compact && isChoice && options.length > 0 ? (
          <ol className="mt-2 space-y-1">
            {options.map((option, index) => {
              const correct = index === question.correctIndex;
              return (
                <li
                  key={index}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm",
                    correct
                      ? "border-success/30 bg-success/10 text-text-primary"
                      : "border-transparent text-text-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 text-xs font-semibold",
                      correct ? "text-success" : "text-text-muted",
                    )}
                  >
                    {String.fromCharCode(65 + index)}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <MathContent content={option} />
                  </div>
                  {correct ? <Badge variant="success">Đáp án</Badge> : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {!compact && isTrueFalse && options.length > 0 ? (
          <ol className="mt-2 space-y-1">
            {options.map((statement, index) => {
              const key = question.tfAnswerKey?.[index];
              return (
                <li
                  key={index}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary odd:bg-bg-secondary/50"
                >
                  <span className="mt-0.5 shrink-0 text-xs font-semibold text-text-muted">
                    {TRUE_FALSE_STATEMENT_LABELS[index]})
                  </span>
                  <div className="min-w-0 flex-1">
                    <MathContent content={statement} />
                  </div>
                  <Badge variant={key ? "success" : "destructive"}>
                    {key ? "Đúng" : "Sai"}
                  </Badge>
                </li>
              );
            })}
          </ol>
        ) : null}

        {compact && isChoice && question.correctIndex != null ? (
          <p className="mt-1.5 text-xs text-text-muted">
            Đáp án:{" "}
            <span className="font-semibold text-success">
              {String.fromCharCode(65 + question.correctIndex)}
            </span>
          </p>
        ) : null}
        {compact && isTrueFalse ? (
          <p className="mt-1.5 text-xs text-text-muted">
            Đáp án:{" "}
            {options.map((_, index) => (
              <span key={index} className="mr-2 font-semibold">
                {TRUE_FALSE_STATEMENT_LABELS[index]}){" "}
                <span
                  className={
                    question.tfAnswerKey?.[index] ? "text-success" : "text-error"
                  }
                >
                  {question.tfAnswerKey?.[index] ? "Đ" : "S"}
                </span>
              </span>
            ))}
          </p>
        ) : null}

        {typeof singleTfKey === "boolean" ? (
          <p className="mt-1.5 text-xs text-text-muted">
            Đáp án:{" "}
            <span
              className={cn(
                "font-semibold",
                singleTfKey ? "text-success" : "text-error",
              )}
            >
              {trueFalseChoiceLabels(question.tfLabelStyle)[singleTfKey ? 0 : 1]}
            </span>
          </p>
        ) : null}

        {question.type === QuestionTypeDto.ordering &&
        (question.options?.length ?? 0) > 0 ? (
          <p className="mt-1.5 text-xs text-text-muted">
            Thứ tự đúng:{" "}
            <span className="font-semibold text-success">
              {(question.options ?? []).join(" → ")}
            </span>
          </p>
        ) : null}

        {question.type === QuestionTypeDto.fill_blank &&
        question.blankAnswerKey?.length ? (
          <ol className="mt-1.5 space-y-0.5 text-xs text-text-muted">
            {question.blankAnswerKey.map((answers, i) => (
              <li key={i}>
                【{i + 1}】{" "}
                <span className="font-semibold text-success">
                  {answers.join(" / ")}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        {!compact && solution ? (
          <details className="mt-2 rounded-md border border-border-default/60 bg-bg-secondary/40 px-2 py-1.5">
            <summary className="cursor-pointer text-xs font-medium text-text-secondary">
              {question.type === QuestionTypeDto.essay
                ? "Barem / ý cần có"
                : "Lời giải"}
            </summary>
            <div className="mt-1.5 text-sm text-text-secondary">
              <MathContent content={solution} />
            </div>
          </details>
        ) : null}

        {(hasElectives && isTrueFalse) || !isAbsolute ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {hasElectives && isTrueFalse ? (
              <QuestionSlotSelect
                value={link.slot}
                disabled={!canEdit}
                onChange={(slot) => void saveSlot(slot)}
              />
            ) : null}
            {isAbsolute ? null : editingPoints ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={weighted ? 1 : 0}
                  value={pointsDraft}
                  onChange={(e) => setPointsDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void savePoints();
                    if (e.key === "Escape") setEditingPoints(false);
                  }}
                  className="w-16 rounded border border-border-default bg-bg-surface px-1.5 py-0.5 text-xs text-text-primary focus:border-border-focus focus:outline-none"
                  aria-label={weighted ? "Trọng số của câu" : "Điểm của câu hỏi"}
                  placeholder={weighted ? "1" : "điểm"}
                />
                <button
                  type="button"
                  onClick={() => void savePoints()}
                  className="rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPoints(false)}
                  className="rounded px-1.5 py-0.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  Hủy
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  setPointsDraft(link.points?.toString() ?? "");
                  setEditingPoints(true);
                }}
                className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-primary/10 hover:text-primary disabled:pointer-events-none"
              >
                {weighted
                  ? `Trọng số ${link.points ?? 1}`
                  : link.points != null
                    ? `${link.points} điểm`
                    : "Chưa đặt điểm"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {showQuestionForm ? (
        <QuestionFormDialog
          question={question}
          courseId={courseId}
          onClose={() => setShowQuestionForm(false)}
          onSaved={() => {
            setShowQuestionForm(false);
            onSaved();
          }}
        />
      ) : null}
    </li>
  );
}
