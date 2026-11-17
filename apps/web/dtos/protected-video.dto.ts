/** Trạng thái Đồng bộ video (bản sao trạng thái UNIOJ `video-sync`). */
export type ProtectedVideoStatus =
  | "pending"
  | "queued"
  | "downloading"
  | "transcoding"
  | "uploading"
  | "ready"
  | "failed";

/** `GET /protected-videos/status` — badge + nút Thử lại cho staff. */
export interface ProtectedVideoStatusDto {
  youtubeId: string;
  status: ProtectedVideoStatus;
  progress: number;
  errorCode: string | null;
  lastSyncError: string | null;
  queuePosition: number | null;
  queueTotal: number | null;
  syncedAt: string | null;
}

/** Giai đoạn đồng bộ học sinh thấy (`pending` gộp vào `queued`). */
export type ProtectedVideoProcessingStage =
  | "queued"
  | "downloading"
  | "transcoding"
  | "uploading";

/**
 * Link phát cho học sinh. Không bao giờ chứa link YouTube.
 * - `ready`: `masterUrl` HLS đã ký, hết hạn ở `expiresAt` (edge trả 403 sau đó).
 * - `processing`: đang đồng bộ — `stage`, `progress` (% tổng, `null` khi 0), vị trí hàng đợi.
 * - `failed`: đồng bộ lỗi, chờ staff Thử lại.
 * - `unavailable`: link không phải YouTube hoặc server chưa cấu hình kho video.
 * - `none`: tiết/buổi không có video.
 */
export type ProtectedVideoPlaybackDto =
  | { state: "ready"; masterUrl: string; expiresAt: string }
  | {
      state: "processing";
      stage: ProtectedVideoProcessingStage;
      progress: number | null;
      queuePosition: number | null;
      queueTotal: number | null;
    }
  | { state: "failed" }
  | { state: "unavailable" }
  | { state: "none" };

/** Nguồn video học sinh xem — backend kiểm quyền theo lớp + tiết/buổi. */
export type ProtectedVideoSource =
  | { kind: "lesson"; classId: string; lessonId: string }
  | { kind: "session"; classId: string; sessionId: string };
