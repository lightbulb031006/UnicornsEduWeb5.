"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ClassContentRemovalTarget } from "@/dtos/class-content.dto";
import * as classApi from "@/lib/apis/class.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { classKeys, classTimelineKeys } from "@/lib/query-keys";
import RemovalImpactDescription from "./RemovalImpactDescription";

/**
 * Xác nhận **Gỡ khỏi lớp** một tiết (khác Ẩn): tiết biến mất ở mọi phía, bài làm/điểm
 * giữ nguyên. Báo trước số câu tự luận chưa chấm và học sinh đang làm dở.
 */
export default function RemoveClassContentItemDialog({
  classId,
  target,
  onClose,
}: {
  classId: string;
  target: ClassContentRemovalTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const impactQuery = useQuery({
    queryKey: classKeys.contentRemovalImpact(classId, target?.id ?? ""),
    queryFn: () =>
      classApi.getClassContentItemRemovalImpact(classId, target!.id),
    enabled: target !== null,
    staleTime: 0,
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) =>
      classApi.removeClassContentItem(classId, itemId),
    onSuccess: () => {
      onClose();
      // Prefix `["class-content", id]` gồm danh sách + nhóm chuyên đề.
      void queryClient.invalidateQueries({
        queryKey: ["class-content", classId],
      });
      void queryClient.invalidateQueries({
        queryKey: classTimelineKeys.list(classId),
      });
      void queryClient.invalidateQueries({
        queryKey: classKeys.modules(classId),
      });
      void queryClient.invalidateQueries({
        queryKey: classKeys.courseLessons(classId),
      });
      toast.success("Đã gỡ tiết khỏi lớp.");
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không gỡ được tiết.")),
  });

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Gỡ tiết “${target?.title ?? ""}” khỏi lớp?`}
      description={
        <RemovalImpactDescription
          intro="Khác Ẩn: tiết biến mất khỏi lớp ở mọi phía (học sinh, gia sư, admin), kể cả lần giao. Bài làm, điểm và lượt xem giữ nguyên; thêm lại tiết sẽ hiện lại, tiết đang Ẩn vẫn ẩn. Gỡ tiết cuối của chuyên đề thì nhóm chuyên đề biến mất."
          subject="Tiết"
          afterRemoval="Sau khi gỡ, trang Chấm bài của tiết không còn lối vào cho tới khi thêm lại tiết."
          loading={impactQuery.isLoading}
          failed={impactQuery.isError}
          ungradedEssayCount={impactQuery.data?.ungradedEssayCount ?? 0}
          inProgressStudentCount={impactQuery.data?.inProgressStudentCount ?? 0}
        />
      }
      confirmLabel="Gỡ khỏi lớp"
      variant="destructive"
      confirmPending={removeMutation.isPending}
      onConfirm={() => {
        if (target) removeMutation.mutate(target.id);
      }}
    />
  );
}
