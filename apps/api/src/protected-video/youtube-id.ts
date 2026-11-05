const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_URL_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&?#\s]+)/;

/**
 * youtube_id (11 ký tự) từ link watch/embed/short/youtu.be hoặc id trần; null nếu không phải
 * link YouTube. Giữ khớp `apps/web/lib/youtube.ts` và regex backfill trong migration
 * `20261023100000_protected_videos`.
 */
export function extractYouTubeId(
  url: string | null | undefined,
): string | null {
  const value = url?.trim();
  if (!value) return null;
  const candidate = value.match(YOUTUBE_URL_RE)?.[1] ?? value;
  return YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

/** Link chuẩn gửi UNIOJ — UNIOJ khoá theo youtube_id nên dạng link không quan trọng. */
export function canonicalYouTubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}
