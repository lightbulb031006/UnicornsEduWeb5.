import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ProtectedVideoStatus } from 'generated/enums';
import { buildMasterUrl, signPlaybackToken } from './playback-token';
import {
  PLAYBACK_TTL_SECONDS,
  ProtectedVideoService,
} from './protected-video.service';
import { UniojVideoSyncError } from './unioj-video-sync.client';
import { extractYouTubeId } from './youtube-id';
import { redactLessonVideo, redactSessionRecording } from './redact-video-url';

const SECRET = 'test-secret';
const EDGE = 'https://edge.example.dev/';
const VIDEO_ID = '01M5CVMBRDYJQCT2FQCCZK8YTS';

describe('extractYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
  ])('%s → %s', (url, id) => {
    expect(extractYouTubeId(url)).toBe(id);
  });

  it.each([
    null,
    '',
    'https://drive.google.com/file/d/abc',
    'https://youtu.be/short',
  ])('%s → null', (url) => {
    expect(extractYouTubeId(url)).toBeNull();
  });
});

describe('signPlaybackToken', () => {
  it('khớp định dạng UniVideo: b64url(payload).b64url(HMAC(secret, b64url(payload)))', () => {
    const token = signPlaybackToken(SECRET, {
      v: VIDEO_ID,
      tv: 1,
      exp: 1700000000,
    });
    const [body, sig] = token.split('.');
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).toEqual(
      { v: VIDEO_ID, tv: 1, exp: 1700000000 },
    );
    expect(sig).toBe(
      createHmac('sha256', SECRET).update(body).digest('base64url'),
    );
    expect(token).not.toMatch(/[=+/]/);
  });

  it('build master URL theo route Worker /t/{token}/v/{video_id}/master.m3u8', () => {
    expect(buildMasterUrl(EDGE, 'tok', VIDEO_ID)).toBe(
      `https://edge.example.dev/t/tok/v/${VIDEO_ID}/master.m3u8`,
    );
  });
});

describe('redact video url', () => {
  it('thay link bằng cờ', () => {
    expect(
      redactLessonVideo({ id: 'l1', videoUrl: 'https://youtu.be/x' }),
    ).toEqual({
      id: 'l1',
      videoUrl: null,
      hasVideo: true,
    });
    expect(redactSessionRecording({ recordingUrl: null })).toEqual({
      recordingUrl: null,
      hasRecording: false,
    });
  });
});

describe('ProtectedVideoService', () => {
  const youtubeId = 'dQw4w9WgXcQ';
  let prisma: {
    protectedVideo: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };
  let unioj: { isConfigured: boolean; submit: jest.Mock; get: jest.Mock };

  const config = (env: Record<string, string>) =>
    ({
      get: (key: string, fallback?: string) => env[key] ?? fallback,
    }) as unknown as ConfigService;

  const makeService = (
    env = { UNIVIDEO_EDGE_URL: EDGE, UNIVIDEO_TOKEN_SECRET: SECRET },
  ) => new ProtectedVideoService(config(env), prisma as any, unioj as any);

  const row = (overrides: Record<string, unknown> = {}) => ({
    youtubeId,
    videoId: null,
    status: ProtectedVideoStatus.pending,
    progress: 0,
    errorCode: null,
    lastSyncError: null,
    queuePosition: null,
    queueTotal: null,
    requestedAt: new Date(),
    syncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const lastUpdate = () =>
    (prisma.protectedVideo.update.mock.calls as unknown[][])[0][0] as {
      data: Record<string, unknown>;
    };

  beforeEach(() => {
    prisma = {
      protectedVideo: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => row(data)),
      },
    };
    unioj = { isConfigured: true, submit: jest.fn(), get: jest.fn() };
  });

  describe('issuePlayback', () => {
    it('ready → master URL ký token tv=1, TTL 4 giờ', async () => {
      prisma.protectedVideo.findUnique.mockResolvedValue(
        row({ status: ProtectedVideoStatus.ready, videoId: VIDEO_ID }),
      );
      const before = Math.floor(Date.now() / 1000);
      const res = await makeService().issuePlayback(
        `https://youtu.be/${youtubeId}`,
      );
      expect(res.state).toBe('ready');
      if (res.state !== 'ready') return;
      const token = res.masterUrl.split('/t/')[1].split('/v/')[0];
      const payload = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
      ) as { v: string; tv: number; exp: number };
      expect(payload.v).toBe(VIDEO_ID);
      expect(payload.tv).toBe(1);
      expect(payload.exp - before).toBeGreaterThanOrEqual(PLAYBACK_TTL_SECONDS);
      expect(res.masterUrl).not.toContain(youtubeId);
    });

    it('chưa ready / failed → processing, không fallback YouTube', async () => {
      prisma.protectedVideo.findUnique.mockResolvedValue(
        row({ status: ProtectedVideoStatus.transcoding, progress: 42 }),
      );
      await expect(makeService().issuePlayback(youtubeId)).resolves.toEqual({
        state: 'processing',
        progress: 42,
      });

      prisma.protectedVideo.findUnique.mockResolvedValue(
        row({
          status: ProtectedVideoStatus.failed,
          errorCode: 'DOWNLOAD_FAILED',
        }),
      );
      await expect(makeService().issuePlayback(youtubeId)).resolves.toEqual({
        state: 'processing',
        progress: null,
      });
    });

    it('progress 0 (xếp hàng / tải về) → ẩn %, bước sau giữ % tổng', async () => {
      for (const status of [
        ProtectedVideoStatus.queued,
        ProtectedVideoStatus.downloading,
      ]) {
        prisma.protectedVideo.findUnique.mockResolvedValue(
          row({ status, progress: 0 }),
        );
        await expect(makeService().issuePlayback(youtubeId)).resolves.toEqual({
          state: 'processing',
          progress: null,
        });
      }

      prisma.protectedVideo.findUnique.mockResolvedValue(
        row({ status: ProtectedVideoStatus.uploading, progress: 90 }),
      );
      await expect(makeService().issuePlayback(youtubeId)).resolves.toEqual({
        state: 'processing',
        progress: 90,
      });
    });

    it('không có link → none; link không phải YouTube / thiếu cấu hình → unavailable', async () => {
      await expect(makeService().issuePlayback(null)).resolves.toEqual({
        state: 'none',
      });
      await expect(
        makeService().issuePlayback('https://drive.google.com/x'),
      ).resolves.toEqual({ state: 'unavailable' });
      await expect(
        makeService({} as any).issuePlayback(youtubeId),
      ).resolves.toEqual({ state: 'unavailable' });
    });
  });

  describe('syncTick', () => {
    it('ghi trạng thái UNIOJ, giữ video_id cũ khi UNIOJ trả null', async () => {
      prisma.protectedVideo.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ youtubeId }]);
      unioj.get.mockResolvedValue({
        youtube_id: youtubeId,
        video_id: null,
        status: 'transcoding',
        progress: 140,
        error_code: null,
        queue: { position: 2, total: 5, percent: 40 },
      });
      await makeService().syncTick();
      const { data } = lastUpdate();
      expect(data).toMatchObject({
        status: 'transcoding',
        progress: 100,
        queuePosition: 2,
        queueTotal: 5,
        errorCode: null,
      });
      expect(data).not.toHaveProperty('videoId');
    });

    it('GET 404 (UNIOJ chưa có job) → về pending để gửi lại', async () => {
      prisma.protectedVideo.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ youtubeId }]);
      unioj.get.mockRejectedValue(
        new UniojVideoSyncError('UNIOJ GET 404: not submitted', 404, true),
      );
      await makeService().syncTick();
      expect(lastUpdate().data).toMatchObject({
        status: ProtectedVideoStatus.pending,
        lastSyncError: 'UNIOJ GET 404: not submitted',
      });
    });

    it('không cấu hình UNIOJ_API_KEY → không làm gì', async () => {
      unioj.isConfigured = false;
      await expect(makeService().syncTick()).resolves.toEqual({
        submitted: 0,
        polled: 0,
      });
      expect(prisma.protectedVideo.findMany).not.toHaveBeenCalled();
    });
  });
});
