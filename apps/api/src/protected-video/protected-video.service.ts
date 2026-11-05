import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProtectedVideoStatus } from 'generated/enums';
import type { ProtectedVideo } from 'generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  ProtectedVideoPlaybackDto,
  ProtectedVideoStatusDto,
} from 'src/dtos/protected-video.dto';
import { buildMasterUrl, signPlaybackToken } from './playback-token';
import {
  UniojVideoSyncClient,
  UniojVideoSyncData,
  UniojVideoSyncError,
} from './unioj-video-sync.client';
import { canonicalYouTubeUrl, extractYouTubeId } from './youtube-id';

/** TTL link phát (ADR: cố định 4 giờ; player tự xin link mới khi gặp 403). */
export const PLAYBACK_TTL_SECONDS = 4 * 60 * 60;
/** LMS cố định token_version = 1 (ADR, mục Consequences). */
const PLAYBACK_TOKEN_VERSION = 1;
/** Số dòng mỗi lượt cron — UNIOJ khuyên poll 30–60s, tránh dồn request khi backfill. */
const SUBMIT_BATCH = 20;
const POLL_BATCH = 50;

const IN_PROGRESS: ProtectedVideoStatus[] = [
  ProtectedVideoStatus.queued,
  ProtectedVideoStatus.downloading,
  ProtectedVideoStatus.transcoding,
  ProtectedVideoStatus.uploading,
];

@Injectable()
export class ProtectedVideoService {
  private readonly logger = new Logger(ProtectedVideoService.name);
  private readonly edgeBaseUrl: string;
  private readonly tokenSecret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly unioj: UniojVideoSyncClient,
  ) {
    this.edgeBaseUrl = config.get<string>('UNIVIDEO_EDGE_URL', '').trim();
    this.tokenSecret = config.get<string>('UNIVIDEO_TOKEN_SECRET', '').trim();
  }

  /**
   * Gọi sau khi lưu/đổi `lessons.video_url` hoặc `sessions.recording_url`. Không ném lỗi
   * và không chờ UNIOJ — lưu tiết/buổi không được hỏng vì kho video.
   */
  track(url: string | null | undefined): void {
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) return;
    void this.enqueue(youtubeId).catch((error: unknown) =>
      this.logger.warn(`track ${youtubeId} failed: ${String(error)}`),
    );
  }

  private async enqueue(youtubeId: string): Promise<void> {
    const row = await this.prisma.protectedVideo.upsert({
      where: { youtubeId },
      create: { youtubeId },
      update: {},
    });
    if (row.status === ProtectedVideoStatus.pending) {
      await this.prisma.protectedVideo.update({
        where: { youtubeId },
        data: { requestedAt: new Date() },
      });
      await this.submit(youtubeId);
    }
  }

  /** Staff bấm «Thử lại»: đưa về `pending` và gửi lại ngay (UNIOJ cho POST lại khi lỗi). */
  async retry(url: string): Promise<ProtectedVideoStatusDto | null> {
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) return null;
    await this.prisma.protectedVideo.upsert({
      where: { youtubeId },
      create: { youtubeId },
      update: {
        status: ProtectedVideoStatus.pending,
        errorCode: null,
        lastSyncError: null,
        requestedAt: new Date(),
      },
    });
    const row = await this.submit(youtubeId);
    return row ? toStatusDto(row) : null;
  }

  /** Trạng thái cho staff; null nếu không phải link YouTube. Link YouTube chưa có dòng → `pending`. */
  async getStatus(url: string): Promise<ProtectedVideoStatusDto | null> {
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) return null;
    const row = await this.prisma.protectedVideo.findUnique({
      where: { youtubeId },
    });
    return row
      ? toStatusDto(row)
      : {
          youtubeId,
          status: ProtectedVideoStatus.pending,
          progress: 0,
          errorCode: null,
          lastSyncError: null,
          queuePosition: null,
          queueTotal: null,
          syncedAt: null,
        };
  }

  /**
   * Link phát cho học sinh. Người gọi PHẢI kiểm quyền xem tiết/buổi trước — hàm này chỉ
   * đọc DB và ký token, không gọi UNIOJ/UniVideo.
   */
  async issuePlayback(
    url: string | null | undefined,
  ): Promise<ProtectedVideoPlaybackDto> {
    if (!url?.trim()) return { state: 'none' };
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) return { state: 'unavailable' };
    if (!this.edgeBaseUrl || !this.tokenSecret) {
      this.logger.error(
        'UNIVIDEO_EDGE_URL / UNIVIDEO_TOKEN_SECRET chưa cấu hình — không cấp được link phát',
      );
      return { state: 'unavailable' };
    }
    const row = await this.prisma.protectedVideo.findUnique({
      where: { youtubeId },
    });
    if (!row) {
      // Link có trước khi bật tính năng mà backfill bỏ sót: tự xếp hàng.
      this.track(url);
      return { state: 'processing', progress: null };
    }
    return this.toPlayback(row);
  }

  /**
   * Quyết định học sinh thấy gì với một dòng Video bảo vệ.
   * ADR: chưa sẵn sàng → «Video đang xử lý», không fallback YouTube.
   */
  private toPlayback(row: ProtectedVideo): ProtectedVideoPlaybackDto {
    if (row.status === ProtectedVideoStatus.ready && row.videoId) {
      const exp = Math.floor(Date.now() / 1000) + PLAYBACK_TTL_SECONDS;
      const token = signPlaybackToken(this.tokenSecret, {
        v: row.videoId,
        tv: PLAYBACK_TOKEN_VERSION,
        exp,
      });
      return {
        state: 'ready',
        masterUrl: buildMasterUrl(this.edgeBaseUrl, token, row.videoId),
        expiresAt: new Date(exp * 1000).toISOString(),
      };
    }
    // Lỗi (failed) vẫn hiện «đang xử lý»: staff thấy badge lỗi và bấm Thử lại.
    // `progress` của UNIOJ là % tổng, chỉ tăng (tải về 0, chuyển mã 0→89, tải lên 90).
    // 0 (xếp hàng / đang tải về) → ẩn, tránh học sinh thấy «Đã xong 0%».
    return {
      state: 'processing',
      progress:
        row.status === ProtectedVideoStatus.failed || row.progress <= 0
          ? null
          : row.progress,
    };
  }

  /** Một lượt cron: gửi các dòng `pending` (mới nhất trước) rồi poll các dòng đang xử lý. */
  async syncTick(): Promise<{ submitted: number; polled: number }> {
    if (!this.unioj.isConfigured) return { submitted: 0, polled: 0 };

    const pending = await this.prisma.protectedVideo.findMany({
      where: { status: ProtectedVideoStatus.pending },
      orderBy: { requestedAt: 'desc' },
      take: SUBMIT_BATCH,
      select: { youtubeId: true },
    });
    for (const { youtubeId } of pending) {
      await this.submit(youtubeId);
    }

    const active = await this.prisma.protectedVideo.findMany({
      where: { status: { in: IN_PROGRESS } },
      orderBy: { syncedAt: { sort: 'asc', nulls: 'first' } },
      take: POLL_BATCH,
      select: { youtubeId: true },
    });
    for (const { youtubeId } of active) {
      await this.poll(youtubeId);
    }
    return { submitted: pending.length, polled: active.length };
  }

  private submit(youtubeId: string): Promise<ProtectedVideo | null> {
    return this.syncWith(youtubeId, () =>
      this.unioj.submit(canonicalYouTubeUrl(youtubeId)),
    );
  }

  private poll(youtubeId: string): Promise<ProtectedVideo | null> {
    return this.syncWith(youtubeId, () =>
      this.unioj.get(canonicalYouTubeUrl(youtubeId)),
    );
  }

  private async syncWith(
    youtubeId: string,
    call: () => Promise<UniojVideoSyncData>,
  ): Promise<ProtectedVideo | null> {
    if (!this.unioj.isConfigured) return null;
    const syncedAt = new Date();
    try {
      const data = await call();
      return await this.prisma.protectedVideo.update({
        where: { youtubeId },
        data: {
          status: data.status,
          // video_id cố định từ lúc vào hàng; không xoá nếu lần sau UNIOJ trả null.
          ...(data.video_id ? { videoId: data.video_id } : {}),
          progress: clampProgress(data.progress),
          errorCode: data.status === 'failed' ? data.error_code : null,
          lastSyncError: null,
          queuePosition: data.queue?.position ?? null,
          queueTotal: data.queue?.total ?? null,
          syncedAt,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error).slice(0, 500);
      this.logger.warn(`UNIOJ sync ${youtubeId}: ${message}`);
      const notSubmitted =
        error instanceof UniojVideoSyncError && error.notSubmitted;
      return this.prisma.protectedVideo.update({
        where: { youtubeId },
        data: {
          lastSyncError: message,
          syncedAt,
          // UNIOJ quên job (GET 404) → gửi lại ở lượt cron sau.
          ...(notSubmitted ? { status: ProtectedVideoStatus.pending } : {}),
        },
      });
    }
  }
}

function clampProgress(value: unknown): number {
  const n = typeof value === 'number' ? Math.round(value) : 0;
  return Math.min(100, Math.max(0, n));
}

function toStatusDto(row: ProtectedVideo): ProtectedVideoStatusDto {
  return {
    youtubeId: row.youtubeId,
    status: row.status,
    progress: row.progress,
    errorCode: row.errorCode,
    lastSyncError: row.lastSyncError,
    queuePosition: row.queuePosition,
    queueTotal: row.queueTotal,
    syncedAt: row.syncedAt?.toISOString() ?? null,
  };
}
