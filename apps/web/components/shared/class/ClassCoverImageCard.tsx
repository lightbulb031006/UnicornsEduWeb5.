"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ClassCoverArt } from "@/components/shared/class/ClassCoverArt";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClassCoverImage } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { classKeys, studentSelfKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const ACCEPTED_COVER_TYPES = "image/jpeg,image/png,image/webp";

// Nút nổi trên ảnh: nền sáng mờ, đọc được cả trên lớp phủ tối lẫn trên ảnh khi cảm ứng.
// Cảm ứng: vùng chạm 44px.
const overlayButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-border-default/60 bg-bg-surface/90 px-3 text-xs font-medium shadow-sm backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 [@media(hover:none)]:min-h-11 [@media(hover:none)]:px-4";

const COVER_HINT =
  "Ảnh bìa hiện trên thẻ lớp của học sinh. JPG, PNG hoặc WEBP, tối đa 5MB.";
// Bản ngắn hiện trên lớp phủ: thumbnail hẹp, câu đầy đủ sẽ tràn 3 dòng che ảnh.
const COVER_HINT_SHORT = "JPG, PNG, WEBP · tối đa 5MB";

type ClassCoverImageCardProps = {
  classId: string;
  /** Khung ngoài (độ rộng, bo góc). Ảnh luôn giữ tỉ lệ 16:9. */
  className?: string;
};

/**
 * Ảnh bìa lớp trong hero trang chi tiết lớp (admin + staff). Ai xem được lớp đều thấy ảnh;
 * nút đổi/xoá hiện khi hover/focus vào ảnh (cảm ứng: luôn hiện ở góc), chỉ khi backend trả
 * `canManage`.
 */
export function ClassCoverImageCard({
  classId,
  className,
}: ClassCoverImageCardProps) {
  const queryClient = useQueryClient();
  const hintId = useId();
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const coverQuery = useQuery<ClassCoverImage>({
    queryKey: classKeys.coverImage(classId),
    queryFn: () => classApi.getClassCoverImage(classId),
    enabled: Boolean(classId),
    staleTime: 5 * 60_000,
  });

  const applyCoverResult = (result: ClassCoverImage) => {
    queryClient.setQueryData(classKeys.coverImage(classId), result);
    void queryClient.invalidateQueries({ queryKey: studentSelfKeys.classes() });
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) => classApi.uploadClassCoverImage(classId, file),
    onSuccess: (result) => {
      applyCoverResult(result);
      toast.success("Đã cập nhật ảnh bìa lớp.");
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "Không tải được ảnh bìa lớp."),
      ),
  });

  const removeMutation = useMutation({
    mutationFn: () => classApi.removeClassCoverImage(classId),
    onSuccess: (result) => {
      applyCoverResult(result);
      setConfirmRemoveOpen(false);
      toast.success("Đã xoá ảnh bìa, thẻ lớp sẽ hiện mascot.");
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "Không xoá được ảnh bìa lớp."),
      ),
  });

  if (coverQuery.isLoading) {
    return (
      <Skeleton className={cn("aspect-[16/9] w-full rounded-xl", className)} />
    );
  }

  // Lỗi tải ảnh bìa không chặn trang: vẫn hiện mascot, chỉ ẩn nút quản lý.
  const coverImageUrl = coverQuery.data?.coverImageUrl ?? null;
  const canManage = coverQuery.data?.canManage === true;
  const busy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <section
      className={cn(
        "group relative w-full overflow-hidden rounded-xl",
        className,
      )}
      aria-label="Ảnh bìa lớp"
    >
      <ClassCoverArt
        classId={classId}
        coverImageUrl={coverImageUrl}
        className="w-full rounded-xl border border-border-default"
      />

      {canManage ? (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/45 p-2 transition-opacity duration-200",
            busy
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            // Máy cảm ứng không hover được: luôn hiện nút ở góc dưới, không phủ tối ảnh.
            "[@media(hover:none)]:items-end [@media(hover:none)]:justify-end [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100",
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <label
              title={COVER_HINT}
              className={cn(
                overlayButtonClass,
                "cursor-pointer text-text-primary hover:bg-bg-surface has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-border-focus",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <ImagePlus className="size-3.5" aria-hidden />
              {uploadMutation.isPending
                ? "Đang tải..."
                : coverImageUrl
                  ? "Đổi ảnh"
                  : "Tải ảnh bìa"}
              <input
                type="file"
                accept={ACCEPTED_COVER_TYPES}
                aria-describedby={hintId}
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) uploadMutation.mutate(file);
                }}
              />
            </label>
            {/* Luôn hiện để người dùng biết có thao tác xoá; chưa có ảnh (đang mascot) thì khoá. */}
            <button
              type="button"
              disabled={busy || !coverImageUrl}
              onClick={() => setConfirmRemoveOpen(true)}
              title={coverImageUrl ? undefined : "Lớp chưa có ảnh bìa để xoá"}
              className={cn(
                overlayButtonClass,
                "text-error enabled:hover:bg-bg-surface",
              )}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {removeMutation.isPending ? "Đang xoá..." : "Xoá ảnh"}
            </button>
          </div>
          <p id={hintId} className="sr-only">
            {COVER_HINT}
          </p>
          <p
            aria-hidden
            className="whitespace-nowrap text-[11px] text-white/90 [@media(hover:none)]:hidden"
          >
            {COVER_HINT_SHORT}
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title="Xoá ảnh bìa lớp?"
        description="Thẻ lớp của học sinh sẽ quay về hiện mascot kỳ lân."
        confirmLabel="Xoá ảnh"
        variant="destructive"
        confirmPending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </section>
  );
}
