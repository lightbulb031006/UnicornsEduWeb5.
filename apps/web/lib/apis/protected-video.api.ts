import { api } from "@/lib/client";
import type {
  ProtectedVideoPlaybackDto,
  ProtectedVideoSource,
  ProtectedVideoStatusDto,
} from "@/dtos/protected-video.dto";

const enc = encodeURIComponent;

export function protectedVideoPlaybackPath(source: ProtectedVideoSource): string {
  return source.kind === "lesson"
    ? `/class/${enc(source.classId)}/lessons/${enc(source.lessonId)}/playback`
    : `/class/${enc(source.classId)}/timeline/sessions/${enc(source.sessionId)}/playback`;
}

/** Link phát đã ký (mỗi lần gọi là một token mới, TTL 4 giờ). */
export async function getProtectedVideoPlayback(
  source: ProtectedVideoSource,
): Promise<ProtectedVideoPlaybackDto> {
  const { data } = await api.get<ProtectedVideoPlaybackDto>(
    protectedVideoPlaybackPath(source),
  );
  return data;
}

/** Trạng thái Đồng bộ video của link YouTube; null nếu không phải link YouTube. */
export async function getProtectedVideoStatus(
  url: string,
): Promise<ProtectedVideoStatusDto | null> {
  const { data } = await api.get<ProtectedVideoStatusDto | null>(
    "/protected-videos/status",
    { params: { url } },
  );
  return data || null;
}

export async function retryProtectedVideo(
  url: string,
): Promise<ProtectedVideoStatusDto | null> {
  const { data } = await api.post<ProtectedVideoStatusDto | null>(
    "/protected-videos/retry",
    { url },
  );
  return data || null;
}
