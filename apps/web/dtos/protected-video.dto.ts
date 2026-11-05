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

/**
 * Link phát cho học sinh. Không bao giờ chứa link YouTube.
 * - `ready`: `masterUrl` HLS đã ký, hết hạn ở `expiresAt` (edge trả 403 sau đó).
 * - `processing`: chưa phát được (đang đồng bộ hoặc lỗi chờ staff thử lại).
 * - `unavailable`: link không phải YouTube hoặc server chưa cấu hình kho video.
 * - `none`: tiết/buổi không có video.
 */
export type ProtectedVideoPlaybackDto =
  | { state: "ready"; masterUrl: string; expiresAt: string }
  | { state: "processing"; progress: number | null }
  | { state: "unavailable" }
  | { state: "none" };

/** Nguồn video học sinh xem — backend kiểm quyền theo lớp + tiết/buổi. */
export type ProtectedVideoSource =
  | { kind: "lesson"; classId: string; lessonId: string }
  | { kind: "session"; classId: string; sessionId: string };
