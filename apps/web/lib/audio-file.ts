import { AUDIO_MAX_BYTES, AUDIO_MIME_TYPES } from "@/dtos/audio-asset.dto";

type FileLike = { type: string; size: number; name: string };

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
};

/**
 * Kiểu MIME của file audio; trình duyệt không báo (vd .m4a trên Windows) thì
 * đoán theo đuôi. null = không hỗ trợ.
 */
export function audioMimeOf(file: FileLike): string | null {
  if ((AUDIO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type;
  }
  if (file.type) return null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

/** Kiểm tra trước khi tải lên (khớp API `audioFileError`); null = hợp lệ. */
export function audioFileError(file: FileLike): string | null {
  if (!audioMimeOf(file)) return "Audio chỉ hỗ trợ MP3, M4A/AAC hoặc WAV.";
  if (file.size > AUDIO_MAX_BYTES) return "Audio vượt quá giới hạn 20MB.";
  return null;
}
