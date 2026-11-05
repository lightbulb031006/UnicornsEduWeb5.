"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { sharedMaterialKeys } from "@/lib/query-keys";
import { invalidateQuestionScopedQueries } from "@/lib/query-invalidation";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { SharedMaterial } from "@/dtos/shared-material.dto";
import { formatLessonUsage } from "./lesson-usage";

/**
 * Xoá Bộ câu hỏi (xoá mềm bộ cùng mọi câu, gỡ khỏi tiết / bài ôn), xác nhận
 * kèm số tiết đang dùng bộ. Lượt đã làm vẫn xem lại được.
 */
export function DeleteQuestionSetButton({
  courseId,
  set,
  onDeleted,
}: {
  courseId: string;
  set: SharedMaterial;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data: usage, isLoading } = useQuery({
    queryKey: sharedMaterialKeys.usage(set.id),
    queryFn: () => sharedMaterialApi.getSharedMaterialUsage(set.id),
    enabled: confirming,
  });
  const where = usage ? formatLessonUsage(usage) : null;

  const remove = useMutation({
    mutationFn: () => sharedMaterialApi.deleteSharedMaterial(set.id),
    onSuccess: async () => {
      toast.success("Đã xoá bộ câu hỏi.");
      setConfirming(false);
      onDeleted();
      await invalidateQuestionScopedQueries(queryClient, courseId);
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thể xoá bộ.")),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-error hover:bg-error/10 sm:min-h-9"
      >
        <Trash2 className="size-4" aria-hidden />
        Xoá bộ
      </button>
      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(false);
          }}
          title={`Xoá bộ "${set.title}"`}
          description={
            isLoading
              ? "Đang đếm số tiết đang dùng bộ…"
              : `Bộ và mọi câu trong bộ bị xoá khỏi ngân hàng${where ? `, gỡ khỏi ${where}` : ""}. Lượt làm đã bắt đầu / đã nộp vẫn xem lại được.`
          }
          confirmLabel="Xoá bộ"
          cancelLabel="Huỷ"
          variant="destructive"
          confirmPending={remove.isPending || isLoading}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </>
  );
}
