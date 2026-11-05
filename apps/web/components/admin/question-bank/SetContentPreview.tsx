"use client";

import { useQuery } from "@tanstack/react-query";
import * as questionApi from "@/lib/apis/question.api";
import { questionKeys } from "@/lib/query-keys";
import { numberBlanks } from "@/lib/fill-blank";
import { Badge } from "@/components/ui/badge";
import MathContent from "@/components/ui/MathContent";
import { questionTypeLabel } from "@/dtos/question.dto";
import type { SharedMaterial } from "@/dtos/shared-material.dto";
import SetHeaderPreview from "./SetHeaderPreview";

/**
 * Cả Bộ câu hỏi cho người soạn xem ngoài form bộ (vd chọn bộ cho ôn nhẹ):
 * phần đầu bộ + các câu theo thứ tự bộ, đánh số 1…n trong bộ.
 */
export default function SetContentPreview({
  courseId,
  set,
}: {
  courseId: string;
  set: SharedMaterial;
}) {
  // Cùng key với thẻ bộ / form bộ trong ngân hàng → không tải lại.
  const filter = { courseId, sharedMaterialId: set.id };
  const { data: questions = [], isPending } = useQuery({
    queryKey: questionKeys.list(filter),
    queryFn: () => questionApi.getQuestions(filter, 0, 200),
  });
  const gapNumbers = new Map(questions.map((q, i) => [q.id, i + 1] as const));

  return (
    <div className="space-y-2">
      <SetHeaderPreview set={set} gapNumbers={gapNumbers} />
      {isPending ? (
        <p className="text-xs text-text-muted">Đang tải câu…</p>
      ) : (
        <ol className="space-y-1.5">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className="flex items-start gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm"
            >
              <span className="shrink-0 text-xs font-semibold tabular-nums text-info">
                Câu {i + 1}.
              </span>
              <MathContent
                content={numberBlanks(q.content)}
                className="min-w-0 flex-1 text-sm text-text-primary"
              />
              <Badge variant="outline" className="shrink-0">
                {questionTypeLabel(q.type)}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
