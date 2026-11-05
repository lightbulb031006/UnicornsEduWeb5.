"use client";

import { useQuery } from "@tanstack/react-query";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { sharedMaterialKeys } from "@/lib/query-keys";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatLessonUsage } from "./lesson-usage";

/**
 * Xác nhận chuyển câu vào / ra Bộ câu hỏi, kèm số tiết bị ảnh hưởng (ADR
 * 2026-10-09-question-set): vào bộ gỡ mọi link lẻ, ra bộ thì câu biến mất khỏi
 * các tiết dùng bộ.
 */
export function MoveQuestionConfirmDialog({
  direction,
  questionId,
  pending,
  onCancel,
  onConfirm,
}: {
  direction: "in" | "out";
  questionId: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { data: usage, isLoading } = useQuery({
    queryKey: sharedMaterialKeys.questionUsage(questionId),
    queryFn: () => sharedMaterialApi.getQuestionLessonUsage(questionId),
  });
  const where = usage ? formatLessonUsage(usage) : null;

  const description = isLoading
    ? "Đang đếm số tiết bị ảnh hưởng…"
    : direction === "in"
      ? `${where ? `Câu đang ở ${where} — câu bị gỡ khỏi các chỗ này. ` : ""}Câu nhận chuyên đề của bộ, đứng cuối bộ và vào mọi tiết / bài ôn đang dùng bộ.`
      : `${where ? `Câu biến mất khỏi ${where} đang dùng bộ` : "Câu chưa ở tiết nào"} và thành câu lẻ. Lượt làm đã bắt đầu không đổi.`;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={direction === "in" ? "Chuyển câu vào bộ" : "Đưa câu ra khỏi bộ"}
      description={description}
      confirmLabel={direction === "in" ? "Chuyển vào" : "Đưa ra"}
      cancelLabel="Huỷ"
      confirmPending={pending || isLoading}
      onConfirm={onConfirm}
    />
  );
}
