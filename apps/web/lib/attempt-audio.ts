import type { AttemptAudioView } from "@/dtos/attempt.dto";

/** Số lượt nghe còn lại; null = không giới hạn. */
export function audioPlaysLeft(audio: AttemptAudioView): number | null {
  if (audio.maxPlays === null) return null;
  return Math.max(0, audio.maxPlays - audio.playsUsed);
}

/** Audio chỉ có URL (ôn nhẹ, xem trước khi soạn): không giới hạn, cho tua. */
export function openAudio(
  url: string | null | undefined,
): AttemptAudioView | null {
  if (!url) return null;
  return { id: url, url, maxPlays: null, allowSeek: true, playsUsed: 0 };
}

/** Giây → "m:ss"; chưa biết thời lượng (NaN / Infinity) → "0:00". */
export function formatAudioTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Dòng nhắc người soạn về Giới hạn nghe học sinh sẽ gặp; null = không giới hạn, cho tua. */
export function listenLimitNote(
  limit: Pick<AttemptAudioView, "maxPlays" | "allowSeek">,
): string | null {
  const parts = [
    limit.maxPlays === null ? null : `nghe tối đa ${limit.maxPlays} lần`,
    limit.allowSeek ? null : "không tua được",
  ].filter(Boolean);
  return parts.length ? `Học sinh: ${parts.join(" · ")}` : null;
}
