"use client";

import { Headphones } from "lucide-react";
import MathContent from "@/components/ui/MathContent";
import QuestionAudio from "@/components/student/QuestionAudio";
import { listenLimitNote } from "@/lib/attempt-audio";
import { materialGapIds, numberMaterialGaps } from "@/lib/material-gaps";
import type { SharedMaterial } from "@/dtos/shared-material.dto";

/**
 * Phần đầu Bộ câu hỏi cho người soạn xem (tiết thực hành, ôn nhẹ): audio nghe
 * thoải mái — không áp Giới hạn nghe, chỉ nhắc học sinh sẽ gặp gì — và văn
 * bản với vị trí trống đánh theo `gapNumbers` (questionId → số câu trên màn).
 */
export default function SetHeaderPreview({
  set,
  gapNumbers,
}: {
  set: SharedMaterial;
  gapNumbers: ReadonlyMap<string, number>;
}) {
  const limitNote = set.audio ? listenLimitNote({
    maxPlays: set.audio.maxPlays ?? null,
    allowSeek: set.audio.allowSeek ?? true,
  }) : null;
  const hasGaps = materialGapIds(set.content).length > 0;

  return (
    <div className="space-y-2 rounded-md border border-info/20 bg-bg-surface px-3 py-2">
      {set.audio ? (
        <div className="space-y-1">
          <QuestionAudio url={set.audio.url} label={`audio bộ ${set.title}`} />
          {limitNote ? (
            <p className="flex items-center gap-1 text-xs text-text-muted">
              <Headphones className="size-3.5 shrink-0" aria-hidden />
              {limitNote}
            </p>
          ) : null}
        </div>
      ) : null}
      <MathContent
        content={numberMaterialGaps(set.content, gapNumbers)}
        className="max-w-none text-sm text-text-primary [&_img]:h-auto [&_img]:max-w-full"
      />
      {hasGaps ? (
        <p className="text-xs text-text-muted">
          Khi làm bài, số câu đánh lại theo thứ tự của từng học sinh.
        </p>
      ) : null}
    </div>
  );
}
