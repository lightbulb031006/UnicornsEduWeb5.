"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { ProtectedVideoStatusDto } from "@/dtos/protected-video.dto";
import {
  getProtectedVideoStatus,
  retryProtectedVideo,
} from "@/lib/apis/protected-video.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { extractYouTubeVideoId } from "@/lib/youtube";

/** Đang đồng bộ: hỏi lại mỗi 15 giây. */
const IN_PROGRESS_REFETCH_MS = 15_000;

export function protectedVideoStatusQueryKey(url: string) {
  return ["protected-video-status", url] as const;
}

function describeStatus(dto: ProtectedVideoStatusDto): {
  label: string;
  variant: "secondary" | "info" | "success" | "destructive";
} {
  switch (dto.status) {
    case "pending":
      return { label: "Chờ gửi đồng bộ", variant: "secondary" };
    case "queued":
      return {
        label:
          dto.queuePosition !== null && dto.queueTotal !== null
            ? `Trong hàng đợi (${dto.queuePosition}/${dto.queueTotal})`
            : "Trong hàng đợi",
        variant: "info",
      };
    case "downloading":
      return { label: `Đang tải về · ${dto.progress}%`, variant: "info" };
    case "transcoding":
      return { label: `Đang chuyển mã · ${dto.progress}%`, variant: "info" };
    case "uploading":
      return { label: `Đang tải lên kho · ${dto.progress}%`, variant: "info" };
    case "ready":
      return { label: "Video bảo vệ sẵn sàng", variant: "success" };
    case "failed":
      return {
        label: dto.errorCode
          ? `Đồng bộ lỗi (${dto.errorCode})`
          : "Đồng bộ lỗi",
        variant: "destructive",
      };
  }
}

/**
 * Trạng thái Đồng bộ video của link YouTube **đã lưu** (học sinh chỉ xem được khi
 * «sẵn sàng»). Ô nhập khác link đã lưu → nhắc lưu trước. Lỗi → nút Thử lại.
 */
export default function ProtectedVideoSyncStatus({
  savedUrl,
  currentUrl,
}: {
  /** Link đang lưu ở tiết/buổi. */
  savedUrl: string | null | undefined;
  /** Giá trị ô nhập hiện tại (bỏ qua để luôn hiện theo link đã lưu). */
  currentUrl?: string;
}) {
  const queryClient = useQueryClient();
  const saved = savedUrl?.trim() ?? "";
  const isYouTube = Boolean(saved && extractYouTubeVideoId(saved));
  const isDirty = currentUrl !== undefined && currentUrl.trim() !== saved;

  const { data, isPending, isError } = useQuery({
    queryKey: protectedVideoStatusQueryKey(saved),
    queryFn: () => getProtectedVideoStatus(saved),
    enabled: isYouTube && !isDirty,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== "ready" && status !== "failed"
        ? IN_PROGRESS_REFETCH_MS
        : false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryProtectedVideo(saved),
    onSuccess: (next) => {
      queryClient.setQueryData(protectedVideoStatusQueryKey(saved), next);
      toast.success("Đã gửi lại video để đồng bộ.");
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(error, "Không gửi lại được video. Thử lại sau."),
      );
    },
  });

  if (isDirty) {
    const next = currentUrl?.trim() ?? "";
    if (!next || !extractYouTubeVideoId(next)) return null;
    return (
      <p className="mt-1.5 text-xs text-text-muted">
        Lưu để bắt đầu đồng bộ video bảo vệ cho học sinh.
      </p>
    );
  }
  if (!isYouTube) return null;
  if (isPending) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-muted">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Đang kiểm tra trạng thái video…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p className="mt-1.5 text-xs text-text-muted">
        Không đọc được trạng thái đồng bộ video.
      </p>
    );
  }

  const { label, variant } = describeStatus(data);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <Badge variant={variant} title={data.lastSyncError ?? undefined}>
        {label}
      </Badge>
      {data.status === "failed" ? (
        <button
          type="button"
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border-default bg-bg-surface px-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
        >
          {retryMutation.isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-3" aria-hidden />
          )}
          Thử lại
        </button>
      ) : null}
    </div>
  );
}
