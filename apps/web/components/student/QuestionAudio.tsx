"use client";

import AttemptAudio from "./AttemptAudio";

/**
 * Audio chỉ có URL (ôn nhẹ, xem lại, soạn đề): cùng trình phát với trang làm
 * bài, không giới hạn, cho tua. Không có URL → trình phát báo lỗi tải.
 */
export default function QuestionAudio({
  url,
  label = "Audio",
}: {
  url: string | null | undefined;
  label?: string;
}) {
  return (
    <AttemptAudio
      audio={{
        id: url ?? "",
        url: url ?? null,
        maxPlays: null,
        allowSeek: true,
        playsUsed: 0,
      }}
      label={label}
    />
  );
}
