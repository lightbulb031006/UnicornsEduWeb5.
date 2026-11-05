/**
 * Audio làm tư liệu (hồ sơ JP). Chỉ nhận định dạng mọi trình duyệt — kể cả
 * iOS Safari — phát được bằng thẻ `<audio>`; ogg/webm bị loại vì Safari cũ.
 */
export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

export function isAllowedAudioMime(mimetype: string | undefined): boolean {
  return mimetype !== undefined && mimetype in AUDIO_EXTENSIONS;
}

export function audioExtension(mimetype: string): string {
  return AUDIO_EXTENSIONS[mimetype] ?? 'bin';
}

export function audioFileError(
  file: { mimetype: string; size: number } | undefined,
): string | null {
  if (!file) return 'Vui lòng chọn file audio.';
  if (!isAllowedAudioMime(file.mimetype)) {
    return 'Audio chỉ hỗ trợ MP3, M4A/AAC hoặc WAV.';
  }
  if (file.size > AUDIO_MAX_BYTES) {
    return `Audio vượt quá giới hạn ${AUDIO_MAX_BYTES / (1024 * 1024)}MB.`;
  }
  return null;
}
