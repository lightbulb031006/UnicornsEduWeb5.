"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import * as questionApi from "@/lib/apis/question.api";
import { courseKeys, questionKeys } from "@/lib/query-keys";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import MathRichTextEditor from "@/components/ui/MathRichTextEditor";
import MathContent from "@/components/ui/MathContent";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CourseLesson } from "@/dtos/course-content.dto";
import {
  CONTENT_LIMITS,
  isHttpUrl,
  overLimitMessage,
} from "@/dtos/content-limits";
import { cn } from "@/lib/utils";

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function TheoryLessonEditor({
  courseId,
  moduleId,
  lesson,
  canEdit,
  className,
}: {
  courseId: string;
  moduleId: string;
  lesson: CourseLesson;
  canEdit: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [content, setContent] = useState(lesson.content ?? "");
  const [quizIds, setQuizIds] = useState<string[]>([]);
  const fieldId = useId();
  const selectedQuizIdSet = useMemo(() => new Set(quizIds), [quizIds]);
  const [quizSeeded, setQuizSeeded] = useState(false);

  const { data: courseQuestions = [] } = useQuery({
    queryKey: questionKeys.list({ courseId, take: 200 }),
    queryFn: () => questionApi.getQuestions({ courseId }, 0, 200),
    enabled: Boolean(courseId) && canEdit,
  });

  const { data: linkedQuizzes = [], isSuccess: linkedReady } = useQuery({
    queryKey: courseKeys.lessonQuizzes(lesson.id),
    queryFn: () => classApi.getLessonQuizzes(lesson.id),
    enabled: Boolean(lesson.id),
  });

  useEffect(() => {
    setVideoUrl(lesson.videoUrl ?? "");
    setContent(lesson.content ?? "");
  }, [lesson.id, lesson.videoUrl, lesson.content]);

  useEffect(() => {
    if (linkedReady && !quizSeeded) {
      setQuizSeeded(true);
      setQuizIds(linkedQuizzes.map((q) => q.questionId));
    }
  }, [linkedReady, quizSeeded, linkedQuizzes]);

  const originalQuizIds = linkedQuizzes.map((q) => q.questionId);
  const isDirty =
    videoUrl !== (lesson.videoUrl ?? "") ||
    content !== (lesson.content ?? "") ||
    (quizSeeded && !sameIdSet(quizIds, originalQuizIds));

  const persist = async () => {
    const nextVideo = videoUrl.trim() || null;
    const nextContent = content.trim() || null;
    if (nextVideo) {
      if (nextVideo.length > CONTENT_LIMITS.url) {
        toast.error(overLimitMessage("Link video", CONTENT_LIMITS.url));
        return;
      }
      if (!isHttpUrl(nextVideo)) {
        toast.error("Link video phải là URL hợp lệ (http/https).");
        return;
      }
    }
    if (nextContent && nextContent.length > CONTENT_LIMITS.theoryContent) {
      toast.error(overLimitMessage("Nội dung tiết học", CONTENT_LIMITS.theoryContent));
      return;
    }

    const currentQuizIdSet = new Set(originalQuizIds);
    const nextQuizIdSet = new Set(quizIds);
    const toAdd = quizIds.filter((id) => !currentQuizIdSet.has(id));
    const toRemove = originalQuizIds.filter((id) => !nextQuizIdSet.has(id));
    if (toRemove.length > 0) {
      const ok = await confirm({
        title: "Gỡ bài tập ôn nhẹ?",
        description: `Sẽ gỡ ${toRemove.length} câu khỏi tiết học này. Tiếp tục?`,
        confirmLabel: "Tiếp tục",
        variant: "destructive",
      });
      if (!ok) return;
    }

    runBackgroundSave({
      loadingMessage: "Đang lưu tiết học...",
      successMessage: "Đã lưu tiết học.",
      errorMessage: "Không thể lưu tiết học.",
      action: async () => {
        await classApi.updateCourseLesson(courseId, moduleId, lesson.id, {
          videoUrl: nextVideo,
          content: nextContent,
        });
        if (toAdd.length) {
          await classApi.linkQuizQuestions(lesson.id, toAdd);
        }
        for (const qid of toRemove) {
          await classApi.unlinkQuizQuestion(lesson.id, qid);
        }
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [...courseKeys.lessons(courseId, moduleId), lesson.id],
          }),
          queryClient.invalidateQueries({
            queryKey: courseKeys.lessonQuizzes(lesson.id),
          }),
        ]);
      },
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", className)}>
      <div className="shrink-0">
        <label
          htmlFor={`${fieldId}-video-url`}
          className="mb-1 block text-xs font-medium text-text-muted"
        >
          Link video YouTube (tuỳ chọn)
        </label>
        <input
          id={`${fieldId}-video-url`}
          value={videoUrl}
          disabled={!canEdit}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <span className="mb-1 block shrink-0 text-xs font-medium text-text-muted">
          Nội dung tiết lý thuyết (hỗ trợ LaTeX: $x^2$)
        </span>
        {canEdit ? (
          <MathRichTextEditor
            value={content}
            onChange={setContent}
            ariaLabel="Nội dung tiết lý thuyết"
            placeholder="Nhập nội dung tiết học..."
            minHeight="min-h-[160px]"
            fill
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border-default p-3 text-sm">
            <MathContent content={content || "—"} />
          </div>
        )}
      </div>

      <div className="shrink-0">
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Bài tập ôn nhẹ ({quizIds.length} câu đã chọn)
        </span>
        <p className="mb-2 text-xs text-text-muted">
          Chọn câu hỏi từ ngân hàng câu hỏi của khoá học. Không sinh bài làm, không tính điểm.
        </p>
        {courseQuestions.length === 0 ? (
          <p className="text-xs italic text-text-muted">
            Chưa có câu hỏi nào trong ngân hàng.
          </p>
        ) : (
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border-default p-2">
            {courseQuestions.map((q) => {
              const isSelected = selectedQuizIdSet.has(q.id);
              return (
                <label
                  key={q.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    isSelected ? "bg-primary/5" : "hover:bg-bg-secondary/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!canEdit}
                    onChange={() => {
                      setQuizIds((prev) =>
                        isSelected ? prev.filter((id) => id !== q.id) : [...prev, q.id],
                      );
                    }}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <MathContent content={q.content.slice(0, 100)} className="text-xs" />
                    <span className="ml-1 text-text-muted">
                      ({q.type === "single_choice" ? "Trắc nghiệm" : "Tự luận"})
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {canEdit ? (
        <div className="flex shrink-0 justify-end">
          <button
            type="button"
            onClick={() => void persist()}
            disabled={!isDirty}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60 sm:min-h-10"
          >
            Lưu tiết học
          </button>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
