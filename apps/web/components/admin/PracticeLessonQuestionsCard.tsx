"use client";

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { practiceLessonQuestionKeys, questionKeys } from "@/lib/query-keys";
import * as classApi from "@/lib/apis/class.api";
import * as questionApi from "@/lib/apis/question.api";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import MathContent from "@/components/ui/MathContent";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import {
  useConfirmDialog,
  type ConfirmRequest,
} from "@/components/ui/ConfirmDialog";
import type { QuestionLink } from "@/dtos/course-content.dto";
import { QuestionTypeDto } from "@/dtos/question.dto";
import QuestionFormDialog from "@/components/admin/question/QuestionFormDialog";

// ─────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────

function usePracticeLessonQuestions(lessonId: string) {
  const queryClient = useQueryClient();

  const { data: links = [], isLoading } = useQuery({
    queryKey: practiceLessonQuestionKeys.list(lessonId),
    queryFn: () => classApi.getPracticeLessonQuestions(lessonId),
    enabled: Boolean(lessonId),
  });

  const { data: summary } = useQuery({
    queryKey: practiceLessonQuestionKeys.summary(lessonId),
    queryFn: () => classApi.getPracticeLessonQuestionSummary(lessonId),
    enabled: Boolean(lessonId),
  });

  const { data: assigned } = useQuery({
    queryKey: practiceLessonQuestionKeys.isAssigned(lessonId),
    queryFn: () => classApi.isPracticeLessonAssigned(lessonId),
    enabled: Boolean(lessonId),
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: practiceLessonQuestionKeys.list(lessonId),
    });
    await queryClient.invalidateQueries({
      queryKey: practiceLessonQuestionKeys.summary(lessonId),
    });
    await queryClient.invalidateQueries({
      queryKey: practiceLessonQuestionKeys.isAssigned(lessonId),
    });
  }, [queryClient, lessonId]);

  return { links, summary, assigned: assigned ?? false, isLoading, invalidate };
}

function useQuestionBank(
  courseId: string,
  filters: { moduleId?: string; difficultyLevelId?: string; search?: string },
) {
  return useQuery({
    queryKey: questionKeys.list({
      courseId,
      ...filters,
      take: 100,
    }),
    queryFn: () =>
      questionApi.getQuestions({ courseId, ...filters }, 0, 100),
    enabled: Boolean(courseId),
  });
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function PracticeLessonQuestionsCard({
  lessonId,
  courseId,
  canEdit,
}: {
  lessonId: string;
  courseId: string;
  canEdit: boolean;
}) {
  const { links, summary, assigned, isLoading, invalidate } =
    usePracticeLessonQuestions(lessonId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border-default bg-bg-surface p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-1 h-3 w-56" />
        <div
          className="mt-3 space-y-2"
          role="status"
          aria-label="Đang tải danh sách câu hỏi"
        >
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-default bg-bg-surface p-4">
      {assigned ? (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <svg className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Đề này đã được giao cho lớp. Việc sửa câu hỏi sẽ ảnh hưởng đến các lần giao đang chạy.
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Ngân hàng câu hỏi
          </h3>
          {summary ? (
            <p className="mt-0.5 text-xs text-text-secondary">
              {summary.totalQuestions} câu hỏi · Tổng điểm: {summary.totalPoints}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover"
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Thêm câu hỏi
          </button>
        ) : null}
      </div>

      {links.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border-default p-4 text-center text-sm text-text-secondary">
          Chưa có câu hỏi nào. Bấm &quot;Thêm câu hỏi&quot; để bắt đầu.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {links.map((link) => (
            <QuestionLinkItem
              key={link.id}
              link={link}
              lessonId={lessonId}
              courseId={courseId}
              canEdit={canEdit}
              assigned={assigned}
              confirm={confirm}
              onSaved={invalidate}
            />
          ))}
        </ul>
      )}

      {showAddDialog ? (
        <AddQuestionDialog
          lessonId={lessonId}
          courseId={courseId}
          existingLinkQuestionIds={links.map((l) => l.questionId)}
          assigned={assigned}
          onClose={() => setShowAddDialog(false)}
          onAdded={invalidate}
        />
      ) : null}
      {dialog}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Question link item (inline edit)
// ─────────────────────────────────────────────────────────────

function QuestionLinkItem({
  link,
  lessonId,
  courseId,
  canEdit,
  assigned,
  confirm,
  onSaved,
}: {
  link: QuestionLink;
  lessonId: string;
  courseId: string;
  canEdit: boolean;
  assigned: boolean;
  confirm: (opts: ConfirmRequest) => Promise<boolean>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [pointsDraft, setPointsDraft] = useState(
    () => link.points?.toString() ?? "",
  );

  /**
   * Sửa câu hỏi là sửa **bản gốc trong ngân hàng**: mọi đề khác dùng chung câu
   * này đổi theo. Bài đã nộp không đổi — chấm điểm đọc snapshot trong
   * `attempt_answers` (ADR `2026-09-07-attempt-exam-snapshot`).
   */
  const openQuestionForm = async () => {
    if (assigned) {
      const ok = await confirm({
        title: "Đề đã giao cho lớp",
        description:
          "Sửa câu hỏi sẽ đổi cả bản gốc trong ngân hàng và mọi đề khác đang dùng câu này. Bài học sinh đã nộp giữ nguyên nội dung cũ. Tiếp tục?",
        confirmLabel: "Tiếp tục",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setShowQuestionForm(true);
  };

  const savePoints = async () => {
    const points = pointsDraft === "" ? null : parseInt(pointsDraft, 10);
    if (points !== null && (isNaN(points) || points < 0)) {
      toast.error("Điểm phải là số nguyên >= 0");
      return;
    }
    if (assigned) {
      const ok = await confirm({
        title: "Đề đã giao cho lớp",
        description:
          "Thay đổi điểm sẽ ảnh hưởng đến lần giao đang chạy. Tiếp tục?",
        confirmLabel: "Tiếp tục",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setEditing(false);
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
        : "Xóa câu hỏi này khỏi đề?",
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

  const isChoice = link.question.type === QuestionTypeDto.single_choice;
  const typeLabel = isChoice ? "Trắc nghiệm" : "Tự luận";
  const options = Array.isArray(link.question.options)
    ? link.question.options
    : [];
  const solution = isChoice
    ? link.question.explanation
    : link.question.answerGuide;

  return (
    <li className="rounded-md border border-border-default/60 bg-bg-primary px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-xs font-medium text-text-muted">
          #{(link.order ?? 0) + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-text-primary">
            <MathContent content={link.question.content} />
          </div>

          {isChoice && options.length > 0 ? (
            <ol className="mt-2 space-y-1">
              {options.map((option, index) => {
                const correct = index === link.question.correctIndex;
                return (
                  <li
                    key={index}
                    className={`flex items-start gap-2 rounded-md px-2 py-1 text-sm ${
                      correct
                        ? "bg-success/10 text-text-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 text-xs font-semibold ${
                        correct ? "text-success" : "text-text-muted"
                      }`}
                    >
                      {String.fromCharCode(65 + index)}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <MathContent content={option} />
                    </div>
                    {correct ? (
                      <span className="shrink-0 text-xs font-medium text-success">
                        Đáp án
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {solution ? (
            <details className="mt-2 rounded-md border border-border-default/60 bg-bg-surface px-2 py-1.5">
              <summary className="cursor-pointer text-xs font-medium text-text-secondary">
                {isChoice ? "Lời giải" : "Barem / ý cần có"}
              </summary>
              <div className="mt-1.5 text-sm text-text-secondary">
                <MathContent content={solution} />
              </div>
            </details>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
              {typeLabel}
            </span>
            {editing ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={pointsDraft}
                  onChange={(e) => setPointsDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void savePoints();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-16 rounded border border-border-default bg-bg-surface px-1.5 py-0.5 text-xs text-text-primary focus:border-border-focus focus:outline-none"
                  aria-label="Điểm của câu hỏi"
                  placeholder="điểm"
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
                  onClick={() => setEditing(false)}
                  className="rounded px-1.5 py-0.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                >
                  Hủy
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPointsDraft(link.points?.toString() ?? "");
                  setEditing(true);
                }}
                className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-primary/10 hover:text-primary"
              >
                {link.points != null ? `${link.points} điểm` : "Chưa đặt điểm"}
              </button>
            )}
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void openQuestionForm()}
              className="rounded p-1 text-text-muted hover:bg-primary/10 hover:text-primary"
              aria-label="Sửa câu hỏi trong ngân hàng"
              title="Sửa câu hỏi trong ngân hàng"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
              aria-label="Xóa câu hỏi khỏi đề"
              title="Xóa câu hỏi khỏi đề"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {showQuestionForm ? (
        <QuestionFormDialog
          question={link.question}
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

// ─────────────────────────────────────────────────────────────
// Add question dialog
// ─────────────────────────────────────────────────────────────

function AddQuestionDialog({
  lessonId,
  courseId,
  existingLinkQuestionIds,
  assigned,
  onClose,
  onAdded,
}: {
  lessonId: string;
  courseId: string;
  existingLinkQuestionIds: string[];
  assigned: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [moduleFilter, setModuleFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);

  const { data: modules = [] } = useCourseModules(courseId);
  const { data: difficultyLevels = [] } = useCourseDifficultyLevels(courseId);

  const { data: questions = [], isLoading: isBankLoading } = useQuestionBank(courseId, {
    moduleId: moduleFilter || undefined,
    difficultyLevelId: difficultyFilter || undefined,
    search: debouncedSearch || undefined,
  });

  // Set: tra cứu O(1) thay vì quét lại danh sách câu đã gắn cho từng câu hỏi.
  // Không useMemo: prop này là mảng mới mỗi render nên memo không giữ được cache.
  const existingLinkQuestionIdSet = new Set(existingLinkQuestionIds);
  const available = questions.filter(
    (q) => !existingLinkQuestionIdSet.has(q.id),
  );

  const addMutation = useMutation({
    mutationFn: (questionId: string) =>
      classApi.addPracticeLessonQuestion(lessonId, { questionId }),
    onSuccess: () => {
      toast.success("Đã thêm câu hỏi.");
      onAdded();
    },
    onError: () => toast.error("Không thể thêm câu hỏi."),
  });

  return (
    <ResponsiveDialog
      size="2xl"
      labelledBy="add-practice-question-title"
      onBackdropClick={onClose}
    >
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h3
            id="add-practice-question-title"
            className="text-sm font-semibold text-text-primary"
          >
            Thêm câu hỏi từ ngân hàng
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-tertiary"
            aria-label="Đóng"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="border-b border-border-default px-4 py-2.5">
          {assigned ? (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <svg className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Đề này đã được giao cho lớp. Thêm câu hỏi sẽ ảnh hưởng đến các lần giao đang chạy.
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm nội dung câu hỏi"
              placeholder="Tìm nội dung câu hỏi..."
              className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            />
            <div className="flex gap-2">
              <UpgradedSelect
                value={moduleFilter}
                onValueChange={setModuleFilter}
                placeholder="Chuyên đề"
                options={modules.map((ch) => ({
                  value: ch.id,
                  label: ch.title,
                }))}
                buttonClassName="w-40"
              />
              <UpgradedSelect
                value={difficultyFilter}
                onValueChange={setDifficultyFilter}
                placeholder="Mức khó"
                options={difficultyLevels.map((dl) => ({
                  value: dl.id,
                  label: dl.name,
                }))}
                buttonClassName="w-36"
              />
            </div>
          </div>
        </div>

        <ResponsiveDialogBody className="px-4 py-2">
          {isBankLoading ? (
            <div
              className="space-y-2 py-2"
              role="status"
              aria-label="Đang tải câu hỏi"
            >
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : available.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">
              {questions.length === 0
                ? "Không có câu hỏi nào trong ngân hàng."
                : "Tất cả câu hỏi đã được thêm."}
            </p>
          ) : (
            <ul className="space-y-2">
              {available.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start gap-3 rounded-md border border-border-default/60 bg-bg-primary px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm text-text-primary">
                      <MathContent content={q.content} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        {q.type === "single_choice" ? "Trắc nghiệm" : "Tự luận"}
                      </span>
                      {q.options && Array.isArray(q.options) ? (
                        <span className="text-[10px] text-text-muted">
                          {q.options.length} đáp án
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate(q.id)}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60"
                  >
                    {addMutation.isPending ? "Đang lưu…" : "Thêm"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ResponsiveDialogBody>

        <ResponsiveActionFooter className="min-[380px]:grid-cols-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-default px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary"
          >
            Đóng
          </button>
        </ResponsiveActionFooter>
    </ResponsiveDialog>
  );
}
