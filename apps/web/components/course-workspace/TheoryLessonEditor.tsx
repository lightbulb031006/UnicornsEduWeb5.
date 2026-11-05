"use client";

import { questionTypeLabel } from "@/dtos/question.dto";
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import * as questionApi from "@/lib/apis/question.api";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { courseKeys, questionKeys, sharedMaterialKeys } from "@/lib/query-keys";
import { useAppConfig } from "@/lib/hooks/useAppConfig";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import MathRichTextEditorWithPreview from "@/components/ui/MathRichTextEditorWithPreview";
import MathContent from "@/components/ui/MathContent";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CourseLesson } from "@/dtos/course-content.dto";
import {
  CONTENT_LIMITS,
  isHttpUrl,
  overLimitMessage,
} from "@/dtos/content-limits";
import { cn } from "@/lib/utils";
import { ChevronDown, Headphones, Layers } from "lucide-react";
import { questionExcerpt } from "@/lib/question-excerpt";
import SetContentPreview from "@/components/admin/question-bank/SetContentPreview";
import ProtectedVideoSyncStatus from "@/components/admin/ProtectedVideoSyncStatus";

type QuizLink = { questionId: string; question: { sharedMaterial?: { id: string } | null } };

const standaloneIdsOf = (links: QuizLink[]) =>
  links.filter((l) => !l.question.sharedMaterial).map((l) => l.questionId);

const setIdsOf = (links: QuizLink[]) => [
  ...new Set(links.flatMap((l) => (l.question.sharedMaterial ? [l.question.sharedMaterial.id] : []))),
];

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Phần tử có trong `next` mà không có trong `current`. */
function added(current: string[], next: string[]): string[] {
  const set = new Set(current);
  return next.filter((id) => !set.has(id));
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
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
  // Câu lẻ và Bộ câu hỏi chọn cho bài ôn — bộ vào / ra bài ôn theo cả bộ.
  const [quizIds, setQuizIds] = useState<string[]>([]);
  const [quizSetIds, setQuizSetIds] = useState<string[]>([]);
  /** Bộ đang mở xem (phần đầu bộ + câu); một bộ một lúc cho gọn. */
  const [openSetId, setOpenSetId] = useState<string | null>(null);
  const fieldId = useId();
  const selectedQuizIdSet = useMemo(() => new Set(quizIds), [quizIds]);
  const [quizSeeded, setQuizSeeded] = useState(false);
  const { data: appConfig } = useAppConfig();
  const setsEnabled = appConfig?.sharedMaterials ?? false;

  const { data: courseQuestions = [] } = useQuery({
    queryKey: questionKeys.list({ courseId, standalone: "true", take: 200 }),
    queryFn: () =>
      questionApi.getQuestions({ courseId, standalone: "true" }, 0, 200),
    enabled: Boolean(courseId) && canEdit,
  });

  const { data: courseSets = [] } = useQuery({
    queryKey: sharedMaterialKeys.course(courseId),
    queryFn: () => sharedMaterialApi.getSharedMaterials(courseId),
    enabled: Boolean(courseId) && canEdit && setsEnabled,
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
      setQuizIds(standaloneIdsOf(linkedQuizzes));
      setQuizSetIds(setIdsOf(linkedQuizzes));
    }
  }, [linkedReady, quizSeeded, linkedQuizzes]);

  const originalQuizIds = standaloneIdsOf(linkedQuizzes);
  const originalSetIds = setIdsOf(linkedQuizzes);
  const isDirty =
    videoUrl !== (lesson.videoUrl ?? "") ||
    content !== (lesson.content ?? "") ||
    (quizSeeded &&
      (!sameIdSet(quizIds, originalQuizIds) ||
        !sameIdSet(quizSetIds, originalSetIds)));
  const setsById = new Map(courseSets.map((set) => [set.id, set]));
  // Bộ rỗng không thêm được; bộ đã trong bài ôn vẫn hiện để gỡ.
  const selectableSets = courseSets.filter(
    (set) => set.questionCount > 0 || originalSetIds.includes(set.id),
  );
  const selectedQuestionCount =
    quizIds.length +
    quizSetIds.reduce(
      (sum, id) => sum + (setsById.get(id)?.questionCount ?? 0),
      0,
    );

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

    const toAdd = added(originalQuizIds, quizIds);
    const toRemove = added(quizIds, originalQuizIds);
    const setsToAdd = added(originalSetIds, quizSetIds);
    const setsToRemove = added(quizSetIds, originalSetIds);
    if (toRemove.length > 0 || setsToRemove.length > 0) {
      const parts = [
        toRemove.length ? `${toRemove.length} câu` : null,
        setsToRemove.length ? `${setsToRemove.length} bộ` : null,
      ].filter(Boolean);
      const ok = await confirm({
        title: "Gỡ bài tập ôn nhẹ?",
        description: `Sẽ gỡ ${parts.join(" và ")} khỏi tiết học này. Tiếp tục?`,
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
        for (const setId of setsToAdd) {
          await classApi.addLessonQuizSet(lesson.id, setId);
        }
        for (const setId of setsToRemove) {
          await classApi.removeLessonQuizSet(lesson.id, setId);
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
        <ProtectedVideoSyncStatus
          savedUrl={lesson.videoUrl}
          currentUrl={videoUrl}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <span className="mb-1 block shrink-0 text-xs font-medium text-text-muted">
          Nội dung tiết lý thuyết (hỗ trợ LaTeX: $x^2$)
        </span>
        {canEdit ? (
          <MathRichTextEditorWithPreview
            value={content}
            onChange={setContent}
            ariaLabel="Nội dung tiết lý thuyết"
            placeholder="Nhập nội dung tiết học..."
            minHeight="min-h-[160px]"
            fill
            markdown
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border-default p-3 text-sm">
            <MathContent content={content || "—"} markdown />
          </div>
        )}
      </div>

      <div className="shrink-0">
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Bài tập ôn nhẹ ({selectedQuestionCount} câu đã chọn)
        </span>
        <p className="mb-2 text-xs text-text-muted">
          Chọn câu lẻ hoặc cả bộ từ ngân hàng câu hỏi của khoá học. Không sinh bài làm, không tính điểm.
        </p>
        {selectableSets.length > 0 ? (
          <div className="mb-2 max-h-[28rem] space-y-1.5 overflow-y-auto rounded-md border border-info/30 bg-info/5 p-2">
            {selectableSets.map((set) => {
              const isSelected = quizSetIds.includes(set.id);
              const isOpen = openSetId === set.id;
              return (
                <div key={set.id} className="space-y-1.5">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-md transition-colors",
                      isSelected ? "bg-info/10" : "hover:bg-bg-secondary/50",
                    )}
                  >
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-xs sm:min-h-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!canEdit}
                        onChange={() => setQuizSetIds((prev) => toggle(prev, set.id))}
                        className="accent-primary"
                      />
                      <Layers className="size-3.5 shrink-0 text-info" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-text-primary">
                        {set.title}
                      </span>
                      {set.audio ? (
                        <Headphones
                          className="size-3.5 shrink-0 text-text-muted"
                          aria-label="Bộ có audio"
                        />
                      ) : null}
                      <span className="shrink-0 text-text-muted">
                        Bộ · {set.questionCount} câu
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setOpenSetId(isOpen ? null : set.id)}
                      aria-expanded={isOpen}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-info hover:bg-info/10 sm:min-h-8"
                    >
                      {isOpen ? "Ẩn bộ" : "Xem bộ"}
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", isOpen && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="pb-1 pl-2">
                      <SetContentPreview courseId={courseId} set={set} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {courseQuestions.length === 0 ? (
          <p className="text-xs italic text-text-muted">
            Chưa có câu lẻ nào trong ngân hàng.
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
                    onChange={() => setQuizIds((prev) => toggle(prev, q.id))}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-text-primary">{questionExcerpt(q.content)}</span>
                    <span className="ml-1 text-text-muted">
                      ({questionTypeLabel(q.type)})
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
