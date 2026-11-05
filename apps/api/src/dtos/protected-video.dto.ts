import type { ProtectedVideoStatus } from 'generated/enums';

/** Trạng thái Đồng bộ video cho staff (badge + nút Thử lại). */
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

/** Body `POST /protected-videos/retry`. */
export interface ProtectedVideoRetryDto {
  url: string;
}

/**
 * Link phát cho học sinh. Không bao giờ chứa link YouTube hay youtube_id.
 * - `ready`: `masterUrl` HLS đã ký, hết hạn ở `expiresAt` (Worker trả 403 sau đó).
 * - `processing`: chưa phát được (đang đồng bộ hoặc lỗi chờ staff thử lại).
 * - `unavailable`: link không phải YouTube hoặc server chưa cấu hình kho video.
 * - `none`: tiết/buổi không có video.
 */
export type ProtectedVideoPlaybackDto =
  | { state: 'ready'; masterUrl: string; expiresAt: string }
  | { state: 'processing'; progress: number | null }
  | { state: 'unavailable' }
  | { state: 'none' };
