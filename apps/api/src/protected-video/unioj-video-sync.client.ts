import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';

/** Trạng thái UNIOJ `video-sync` (API v1.1). */
export type UniojVideoStatus =
  | 'queued'
  | 'downloading'
  | 'transcoding'
  | 'uploading'
  | 'ready'
  | 'failed';

export interface UniojVideoSyncData {
  youtube_id: string;
  youtube_url: string;
  /** ULID Video trong UniVideo; null nếu kho chưa nhận job. */
  video_id: string | null;
  status: UniojVideoStatus;
  ready: boolean;
  progress: number;
  error_code: string | null;
  queue: { position: number; total: number; percent: number } | null;
  description?: string;
  updated_at?: string;
}

/** Lỗi gọi UNIOJ; `notSubmitted` = GET trả 404 (cần POST lại). */
export class UniojVideoSyncError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly notSubmitted = false,
  ) {
    super(message);
  }
}

const DEFAULT_BASE_URL = 'https://oj.uniedu.vn';
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class UniojVideoSyncClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.apiKey = config.get<string>('UNIOJ_API_KEY', '');
    this.baseUrl = (
      config.get<string>('UNIOJ_BASE_URL', DEFAULT_BASE_URL) || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /** `POST /api/video-sync/` — 201 lần đầu, 200 nếu đã có (idempotent theo youtube_id). */
  submit(youtubeUrl: string): Promise<UniojVideoSyncData> {
    return this.call('post', youtubeUrl);
  }

  /** `GET /api/video-sync/?youtube_url=` — 404 nếu chưa POST. */
  get(youtubeUrl: string): Promise<UniojVideoSyncData> {
    return this.call('get', youtubeUrl);
  }

  private async call(
    method: 'get' | 'post',
    youtubeUrl: string,
  ): Promise<UniojVideoSyncData> {
    const url = `${this.baseUrl}/api/video-sync/`;
    const headers = { Authorization: `Bearer ${this.apiKey}` };
    try {
      const res =
        method === 'post'
          ? await this.http.axiosRef.post<{ data: UniojVideoSyncData }>(
              url,
              { youtube_url: youtubeUrl },
              { headers, timeout: REQUEST_TIMEOUT_MS },
            )
          : await this.http.axiosRef.get<{ data: UniojVideoSyncData }>(url, {
              headers,
              params: { youtube_url: youtubeUrl },
              timeout: REQUEST_TIMEOUT_MS,
            });
      if (!res.data?.data?.youtube_id) {
        throw new UniojVideoSyncError('UNIOJ trả dữ liệu rỗng', res.status);
      }
      return res.data.data;
    } catch (error) {
      if (error instanceof UniojVideoSyncError) throw error;
      if (isAxiosError(error)) {
        const status = error.response?.status ?? null;
        const body = error.response?.data as
          | { detail?: unknown; error?: { message?: unknown } }
          | undefined;
        const detail =
          (typeof body?.error?.message === 'string' && body.error.message) ||
          (typeof body?.detail === 'string' && body.detail) ||
          error.message;
        throw new UniojVideoSyncError(
          `UNIOJ ${method.toUpperCase()} ${status ?? 'network'}: ${detail}`.slice(
            0,
            500,
          ),
          status,
          method === 'get' && status === 404,
        );
      }
      throw new UniojVideoSyncError(String(error).slice(0, 500), null);
    }
  }
}
