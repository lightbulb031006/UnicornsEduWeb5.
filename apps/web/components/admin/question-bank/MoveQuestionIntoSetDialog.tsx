"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { X } from "lucide-react";
import { toast } from "sonner";
import * as questionApi from "@/lib/apis/question.api";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { questionKeys } from "@/lib/query-keys";
import { invalidateQuestionScopedQueries } from "@/lib/query-invalidation";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { questionTypeLabel } from "@/dtos/question.dto";
import { MoveQuestionConfirmDialog } from "./MoveQuestionConfirmDialog";
import { questionExcerpt } from "@/lib/question-excerpt";

/** Chọn một câu lẻ có sẵn của khoá để chuyển vào bộ (kèm xác nhận số tiết). */
export function MoveQuestionIntoSetDialog({
  courseId,
  setId,
  onClose,
}: {
  courseId: string;
  setId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);
  const [target, setTarget] = useState<string | null>(null);

  const filter = {
    courseId,
    standalone: "true" as const,
    search: debouncedSearch || undefined,
  };
  const { data: questions = [], isLoading } = useQuery({
    queryKey: questionKeys.list({ ...filter, take: 50 }),
    queryFn: () => questionApi.getQuestions(filter, 0, 50),
  });

  const moveIn = useMutation({
    mutationFn: (questionId: string) =>
      sharedMaterialApi.moveQuestionIntoSet(setId, questionId),
    onSuccess: async () => {
      toast.success("Đã chuyển câu vào bộ.");
      setTarget(null);
      await invalidateQuestionScopedQueries(queryClient, courseId);
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "Không chuyển được câu vào bộ."),
      ),
  });

  return (
    <ResponsiveDialog
      size="xl"
      labelledBy="move-into-set-title"
      onBackdropClick={onClose}
    >
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h3
          id="move-into-set-title"
          className="text-sm font-semibold text-text-primary"
        >
          Chuyển câu có sẵn vào bộ
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary sm:size-9"
          aria-label="Đóng"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="border-b border-border-default px-4 py-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm câu lẻ"
          placeholder="Tìm nội dung câu lẻ..."
          className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
        />
      </div>
      <ResponsiveDialogBody className="px-4 py-2">
        {isLoading ? (
          <div className="space-y-2 py-2" role="status" aria-label="Đang tải">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : questions.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            Không có câu lẻ phù hợp.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {questions.map((q) => (
              <li key={q.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">
                    {questionExcerpt(q.content)}
                  </p>
                  <Badge variant="outline" className="mt-0.5">
                    {questionTypeLabel(q.type)}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget(q.id)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-border-default px-3 text-sm font-medium text-primary hover:border-primary/50 sm:min-h-9"
                >
                  Chuyển vào
                </button>
              </li>
            ))}
          </ul>
        )}
      </ResponsiveDialogBody>

      {target ? (
        <MoveQuestionConfirmDialog
          direction="in"
          questionId={target}
          pending={moveIn.isPending}
          onCancel={() => setTarget(null)}
          onConfirm={() => moveIn.mutate(target)}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
