/** Audio gắn vào câu / tư liệu dùng chung (JP). `url` là signed URL ngắn hạn. */
export interface AudioRef {
  id: string;
  originalName: string;
  /** null = storage lỗi; vắng khi lấy từ danh sách câu của đề (không ký URL). */
  url?: string | null;
  /** Giới hạn lượt nghe trong một lượt làm; null = không giới hạn. */
  maxPlays?: number | null;
  /** false = học sinh không tua được khi đang làm bài. */
  allowSeek?: boolean;
}

/** Khớp API `AUDIO_MAX_PLAYS_OPTIONS`. */
export const AUDIO_MAX_PLAYS_OPTIONS = [1, 2] as const;

export interface UpdateAudioLimitsPayload {
  maxPlays: number | null;
  allowSeek: boolean;
}

/** Khớp API `AUDIO_MAX_BYTES`. */
export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

/** MP3, M4A/AAC, WAV — phát được bằng `<audio>` trên iOS Safari. */
export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
] as const;

export const AUDIO_ACCEPT = [...AUDIO_MIME_TYPES, ".mp3", ".m4a", ".aac", ".wav"].join(",");
