"use client";

import { useCallback, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, VideoOff } from "lucide-react";
import type {
  ProtectedVideoPlaybackDto,
  ProtectedVideoSource,
} from "@/dtos/protected-video.dto";
import { getProtectedVideoPlayback } from "@/lib/apis/protected-video.api";
import { useDevToolsDetector } from "@/lib/useDevToolsDetector";
import { cn } from "@/lib/utils";

const ProtectedHlsPlayer = dynamic(() => import("./ProtectedHlsPlayer"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-black" />,
});

/** Video đang đồng bộ: hỏi lại server mỗi 30 giây. */
const PROCESSING_REFETCH_MS = 30_000;

export function protectedVideoPlaybackQueryKey(source: ProtectedVideoSource) {
  return [
    "protected-video-playback",
    source.kind,
    source.classId,
    source.kind === "lesson" ? source.lessonId : source.sessionId,
  ] as const;
}

export type ProtectedVideoPlayerProps = {
  source: ProtectedVideoSource;
  title?: string;
  /** Khung ngoài (tỉ lệ, bo góc, chiều cao tối thiểu). */
  className?: string;
  /** `none` cho danh sách nhiều video (chỉ tải khi bấm phát). */
  preload?: "none" | "metadata";
  /** Tắt khi khung chưa gần viewport — không xin link phát. */
  enabled?: boolean;
};

function PlayerNotice({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center select-none">
      <div className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/80">
        {icon}
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-white/70">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * Video bảo vệ cho học sinh: xin link HLS đã ký theo tiết/buổi (backend kiểm quyền),
 * không bao giờ nhận link YouTube. Token hết hạn giữa chừng → xin link mới, phát tiếp
 * đúng vị trí. Mở DevTools → gỡ player khỏi DOM.
 */
export default function ProtectedVideoPlayer({
  source,
  title,
  className,
  preload,
  enabled = true,
}: ProtectedVideoPlayerProps) {
  const isDevToolsOpen = useDevToolsDetector({ enabled: true });
  const canFetch = enabled && !isDevToolsOpen;

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: protectedVideoPlaybackQueryKey(source),
    queryFn: () => getProtectedVideoPlayback(source),
    enabled: canFetch,
    // Mỗi lần gọi là token mới → đổi src → player nạp lại. Chỉ xin lại khi cần.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.state === "processing" ? PROCESSING_REFETCH_MS : false,
  });

  const handleExpired = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-black",
        className,
      )}
    >
      {renderBody()}
    </div>
  );

  function renderBody() {
    if (isDevToolsOpen) {
      return (
        <PlayerNotice
          icon={<ShieldAlert className="size-5" aria-hidden />}
          title="Nội dung video được bảo vệ bản quyền"
          description="Vui lòng đóng công cụ kiểm tra (Developer Tools) và tải lại trang để tiếp tục xem video."
        />
      );
    }
    if (!canFetch) return null;
    if (isPending) {
      return <div className="h-full w-full animate-pulse bg-black" />;
    }
    if (isError || !data) {
      return (
        <PlayerNotice
          icon={<VideoOff className="size-5" aria-hidden />}
          title="Không tải được video"
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isRefetching}
              className="mt-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
            >
              {isRefetching ? "Đang tải lại…" : "Thử lại"}
            </button>
          }
        />
      );
    }
    return renderPlayback(data);
  }

  function renderPlayback(playback: ProtectedVideoPlaybackDto) {
    switch (playback.state) {
      case "ready":
        return (
          <ProtectedHlsPlayer
            masterUrl={playback.masterUrl}
            title={title}
            preload={preload}
            onExpired={handleExpired}
          />
        );
      case "processing":
        return (
          <PlayerNotice
            icon={<Loader2 className="size-5 animate-spin" aria-hidden />}
            title="Video đang xử lý"
            description={
              playback.progress !== null
                ? `Đã xong ${playback.progress}%. Trang sẽ tự cập nhật khi video sẵn sàng.`
                : "Trang sẽ tự cập nhật khi video sẵn sàng."
            }
          />
        );
      case "unavailable":
        return (
          <PlayerNotice
            icon={<VideoOff className="size-5" aria-hidden />}
            title="Video không khả dụng"
            description="Liên hệ gia sư hoặc trợ giảng của lớp nếu em cần xem video này."
          />
        );
      case "none":
        return (
          <PlayerNotice
            icon={<VideoOff className="size-5" aria-hidden />}
            title="Chưa có video"
          />
        );
    }
  }
}
