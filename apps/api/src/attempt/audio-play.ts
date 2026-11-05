/** Giới hạn nghe đặt trên từng audio (CONTEXT: Giới hạn nghe). */
export type AudioLimit = {
  id: string;
  /** Signed URL; null = storage lỗi. */
  url: string | null;
  /** null = không giới hạn. */
  maxPlays: number | null;
  allowSeek: boolean;
};

export type AttemptAudioView = {
  id: string;
  /** null khi audio giới hạn và lượt đang làm — xin URL qua endpoint phát (đếm lượt). */
  url: string | null;
  maxPlays: number | null;
  allowSeek: boolean;
  playsUsed: number;
};

/**
 * Audio trong Bài làm. Lượt đang làm áp giới hạn; xem lại sau nộp thì không
 * (nghe bao nhiêu lần cũng được, cho tua).
 */
export function attemptAudioView(
  audio: AudioLimit,
  playsUsed: number,
  inProgress: boolean,
): AttemptAudioView {
  if (!inProgress) {
    return {
      id: audio.id,
      url: audio.url,
      maxPlays: null,
      allowSeek: true,
      playsUsed,
    };
  }
  return {
    id: audio.id,
    url: audio.maxPlays === null ? audio.url : null,
    maxPlays: audio.maxPlays,
    allowSeek: audio.allowSeek,
    playsUsed,
  };
}
