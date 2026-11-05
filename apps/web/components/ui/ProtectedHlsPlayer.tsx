"use client";

import "@videojs/react/video/skin.css";
import { useEffect, useRef, type RefObject } from "react";
import { I18nProvider } from "@videojs/react/i18n";
import { HlsJsVideo } from "@videojs/react/media/hlsjs-video";
import { VideoPlayer, VideoSkin, usePlayer } from "@videojs/react/video";
import { cn } from "@/lib/utils";

/** Không xin link mới quá 1 lần trong khoảng này — link mới vẫn lỗi thì để skin hiện lỗi. */
const MIN_REFRESH_INTERVAL_MS = 20_000;

type ResumePoint = { time: number; play: boolean };

export type ProtectedHlsPlayerProps = {
  masterUrl: string;
  title?: string;
  preload?: "none" | "metadata";
  className?: string;
  /** Gọi khi engine báo lỗi cuối (thường là 403 do token hết hạn) — cha xin link phát mới. */
  onExpired: () => void;
};

/**
 * Lắng nghe lỗi cuối của player (Worker trả 403 khi token hết hạn → hls.js bỏ cuộc), ghi
 * lại vị trí đang xem rồi xin link mới. Nằm trong `VideoPlayer` để đọc được store.
 */
function ExpiryWatcher({
  videoRef,
  resumeRef,
  onExpired,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  resumeRef: RefObject<ResumePoint | null>;
  onExpired: () => void;
}) {
  // Kiểu store nằm ở `@videojs/core` (không phải dep trực tiếp) → state là `unknown`.
  const error = usePlayer(
    (state) => (state as { error?: unknown } | null)?.error ?? null,
  );
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!error) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    const video = videoRef.current;
    if (video) {
      resumeRef.current = { time: video.currentTime, play: !video.paused };
    }
    onExpired();
  }, [error, onExpired, resumeRef, videoRef]);

  return null;
}

/** Trình phát HLS (Video.js v10 + hls.js) cho video bảo vệ. Import qua `next/dynamic`. */
export default function ProtectedHlsPlayer({
  masterUrl,
  title,
  preload = "metadata",
  className,
  onExpired,
}: ProtectedHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeRef = useRef<ResumePoint | null>(null);

  // Link mới đã nạp xong → quay lại đúng chỗ đang xem.
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    const resume = resumeRef.current;
    if (!video || !resume) return;
    resumeRef.current = null;
    video.currentTime = resume.time;
    if (resume.play) void video.play().catch(() => undefined);
  };

  return (
    <I18nProvider locale="vi">
      <VideoPlayer>
        <VideoSkin className={cn("h-full w-full", className)}>
          <HlsJsVideo
            ref={videoRef}
            src={masterUrl}
            title={title}
            preload={preload}
            playsInline
            controlsList="nodownload"
            disablePictureInPicture
            onContextMenu={(event) => event.preventDefault()}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </VideoSkin>
        <ExpiryWatcher
          videoRef={videoRef}
          resumeRef={resumeRef}
          onExpired={onExpired}
        />
      </VideoPlayer>
    </I18nProvider>
  );
}
