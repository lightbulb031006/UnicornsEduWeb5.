"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import * as questionApi from "@/lib/apis/question.api";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { invalidateQuestionScopedQueries } from "@/lib/query-invalidation";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import QuestionFormDialog from "@/components/admin/question/QuestionFormDialog";
import { questionTypeLabel, type Question } from "@/dtos/question.dto";
import type { SharedMaterial } from "@/dtos/shared-material.dto";
import { MoveQuestionConfirmDialog } from "./MoveQuestionConfirmDialog";
import { MoveQuestionIntoSetDialog } from "./MoveQuestionIntoSetDialog";
import { questionExcerpt } from "@/lib/question-excerpt";

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40 sm:size-9";

/**
 * Các câu trong một Bộ câu hỏi, theo thứ tự bộ: thêm câu (nhận chuyên đề của
 * bộ), chuyển câu lẻ có sẵn vào, đưa câu ra, sửa, xoá, đổi chỗ. Mọi thao tác
 * lưu ngay, không chờ nút Lưu của form bộ.
 */
export default function SetQuestionList({
  courseId,
  set,
  questions,
  loading,
}: {
  courseId: string;
  set: SharedMaterial;
  /** Câu (chưa xoá) của bộ, đã xếp theo thứ tự bộ. */
  questions: Question[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [moveOutTarget, setMoveOutTarget] = useState<Question | null>(null);
  const [pickingExisting, setPickingExisting] = useState(false);

  const reorder = useMutation({
    mutationFn: (questionIds: string[]) =>
      sharedMaterialApi.reorderSetQuestions(set.id, questionIds),
    onSuccess: () => invalidateQuestionScopedQueries(queryClient, courseId),
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không đổi được thứ tự.")),
  });

  const remove = useMutation({
    mutationFn: questionApi.deleteQuestion,
    onSuccess: async () => {
      toast.success("Đã xoá câu khỏi bộ.");
      setDeleteTarget(null);
      await invalidateQuestionScopedQueries(queryClient, courseId);
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thể xoá câu hỏi.")),
  });

  const moveOut = useMutation({
    mutationFn: (questionId: string) =>
      sharedMaterialApi.moveQuestionOutOfSet(set.id, questionId),
    onSuccess: async () => {
      toast.success("Đã đưa câu ra khỏi bộ.");
      setMoveOutTarget(null);
      await invalidateQuestionScopedQueries(queryClient, courseId);
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "Không đưa được câu ra khỏi bộ."),
      ),
  });

  const move = (index: number, delta: -1 | 1) => {
    const ids = questions.map((q) => q.id);
    const target = index + delta;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <section className="space-y-2 rounded-lg border border-border-default p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          Câu trong bộ ({questions.length})
        </h3>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setPickingExisting(true)}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border-default px-3 text-sm font-medium text-text-secondary hover:border-primary/50 sm:min-h-9"
          >
            <FolderInput className="size-4" aria-hidden />
            Câu có sẵn
          </button>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border-default px-3 text-sm font-medium text-primary hover:border-primary/50 sm:min-h-9"
          >
            <Plus className="size-4" aria-hidden />
            Thêm câu
          </button>
        </div>
      </div>
      {loading ? (
        <p className="text-xs text-text-muted">Đang tải câu…</p>
      ) : questions.length === 0 ? (
        <p className="text-xs text-text-muted">
          Bộ chưa có câu — thêm câu đầu tiên.
        </p>
      ) : (
        <ol className="divide-y divide-border-subtle">
          {questions.map((q, i) => (
            <li key={q.id} className="flex items-center gap-2 py-1.5">
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-text-muted">
                {i + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">
                  {questionExcerpt(q.content)}
                </p>
                <Badge variant="outline" className="mt-0.5">
                  {questionTypeLabel(q.type)}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  className={ICON_BUTTON}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                  aria-label={`Đưa câu ${i + 1} lên`}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  disabled={i === questions.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)}
                  aria-label={`Đưa câu ${i + 1} xuống`}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  onClick={() => setEditing(q)}
                  aria-label={`Sửa câu ${i + 1}`}
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  onClick={() => setMoveOutTarget(q)}
                  aria-label={`Đưa câu ${i + 1} ra khỏi bộ`}
                >
                  <Unlink className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${ICON_BUTTON} hover:bg-error/10 hover:text-error`}
                  onClick={() => setDeleteTarget(q)}
                  aria-label={`Xoá câu ${i + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {editing ? (
        <QuestionFormDialog
          question={editing === "new" ? null : editing}
          courseId={courseId}
          set={{ id: set.id, moduleId: set.moduleId }}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : null}

      {pickingExisting ? (
        <MoveQuestionIntoSetDialog
          courseId={courseId}
          setId={set.id}
          onClose={() => setPickingExisting(false)}
        />
      ) : null}

      {moveOutTarget ? (
        <MoveQuestionConfirmDialog
          direction="out"
          questionId={moveOutTarget.id}
          pending={moveOut.isPending}
          onCancel={() => setMoveOutTarget(null)}
          onConfirm={() => moveOut.mutate(moveOutTarget.id)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Xoá câu khỏi bộ"
          description="Câu bị xoá khỏi ngân hàng câu hỏi và khỏi mọi tiết đang dùng bộ. Hành động này không thể hoàn tác."
          confirmLabel="Xoá"
          cancelLabel="Huỷ"
          variant="destructive"
          confirmPending={remove.isPending}
          onConfirm={() => remove.mutate(deleteTarget.id)}
        />
      ) : null}
    </section>
  );
}
