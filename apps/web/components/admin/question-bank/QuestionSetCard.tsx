"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Headphones, Layers } from "lucide-react";
import * as questionApi from "@/lib/apis/question.api";
import { questionKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import MathContent from "@/components/ui/MathContent";
import { questionTypeLabel } from "@/dtos/question.dto";
import { numberMaterialGaps } from "@/lib/material-gaps";
import type { SharedMaterial } from "@/dtos/shared-material.dto";
import { questionExcerpt } from "@/lib/question-excerpt";

/**
 * Một Bộ câu hỏi trong ngân hàng: phần đầu bộ tóm tắt; mở ra xem các câu theo
 * thứ tự bộ (tải khi mở). Bấm thẻ → form bộ.
 */
export default function QuestionSetCard({
  courseId,
  set,
  moduleTitle,
  onOpen,
}: {
  courseId: string;
  set: SharedMaterial;
  moduleTitle?: string;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Cùng key với form bộ → mở form không tải lại.
  const filter = { courseId, sharedMaterialId: set.id };
  const { data: questions = [], isPending } = useQuery({
    queryKey: questionKeys.list(filter),
    queryFn: () => questionApi.getQuestions(filter, 0, 200),
    enabled: expanded,
  });

  return (
    <li className="rounded-lg border border-info/30 bg-info/5">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-t-lg p-3 text-left transition-colors hover:bg-info/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        aria-label={`Mở bộ ${set.title}`}
      >
        <div className="flex items-start gap-2">
          <Layers className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text-primary">{set.title}</p>
            <MathContent
              // Tóm tắt chưa có số câu → vị trí trống hiện ô không số.
              content={numberMaterialGaps(set.content, new Map())}
              className="mt-1 line-clamp-2 text-sm text-text-secondary [&_img]:hidden"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="info">Bộ · {set.questionCount} câu</Badge>
          {moduleTitle ? <Badge variant="outline">{moduleTitle}</Badge> : null}
          {set.audio ? (
            <Badge variant="secondary">
              <Headphones className="size-3" aria-hidden />
              Audio
            </Badge>
          ) : null}
        </div>
      </button>
      {set.questionCount > 0 ? (
        <div className="border-t border-info/20">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex min-h-11 w-full items-center gap-1 px-3 text-xs font-medium text-text-secondary hover:text-text-primary sm:min-h-9"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
            {expanded ? "Ẩn câu trong bộ" : "Xem câu trong bộ"}
          </button>
          {expanded ? (
            isPending ? (
              <p className="px-3 pb-3 text-xs text-text-muted">Đang tải câu…</p>
            ) : (
              <ol className="space-y-1 px-3 pb-3">
                {questions.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-2 text-sm">
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-text-muted">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {questionExcerpt(q.content)}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {questionTypeLabel(q.type)}
                    </Badge>
                  </li>
                ))}
              </ol>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
