import { createHmac } from 'crypto';

/**
 * Playback Token của UniVideo (`src/shared/token.ts` bên repo UniVideo):
 * `b64url(JSON{v, tv, exp}) + "." + b64url(HMAC-SHA256(TOKEN_SECRET, payloadB64))`.
 * Worker kiểm chữ ký → `v` khớp path → `exp` → `tv >= meta.token_version`.
 */
export interface PlaybackTokenPayload {
  /** video_id (ULID) trong kho UniVideo. */
  v: string;
  /** token_version; Video mới luôn là 1 (ADR: LMS cố định tv = 1). */
  tv: number;
  /** Unix seconds. */
  exp: number;
}

export function signPlaybackToken(
  secret: string,
  payload: PlaybackTokenPayload,
): string {
  const body = Buffer.from(
    JSON.stringify({ v: payload.v, tv: payload.tv, exp: payload.exp }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function buildMasterUrl(
  edgeBaseUrl: string,
  token: string,
  videoId: string,
): string {
  return `${edgeBaseUrl.replace(/\/+$/, '')}/t/${token}/v/${videoId}/master.m3u8`;
}
