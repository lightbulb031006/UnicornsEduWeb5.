/**
 * Link YouTube gốc không bao giờ tới trình duyệt học sinh (ADR
 * 2026-10-18-protected-video-via-unioj-sync). Response cho học sinh thay link bằng cờ
 * `hasVideo`/`hasRecording`; player xin link phát qua endpoint `…/playback`.
 */
export function redactLessonVideo<T extends { videoUrl: string | null }>(
  lesson: T,
): T & { hasVideo: boolean } {
  return {
    ...lesson,
    videoUrl: null,
    hasVideo: Boolean(lesson.videoUrl?.trim()),
  };
}

export function redactSessionRecording<
  T extends { recordingUrl: string | null },
>(session: T): T & { hasRecording: boolean } {
  return {
    ...session,
    recordingUrl: null,
    hasRecording: Boolean(session.recordingUrl?.trim()),
  };
}
