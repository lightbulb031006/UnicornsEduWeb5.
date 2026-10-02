"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import * as questionApi from "@/lib/apis/question.api";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import { questionKeys } from "@/lib/query-keys";
import MathContent from "@/components/ui/MathContent";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import AiImportModal from "@/components/admin/question-bank/AiImportModal";
import QuestionFormFields, {
  emptyQuestionFormValue,
  type QuestionFormValue,
} from "@/components/admin/question/QuestionFormFields";
import { Skeleton } from "@/components/ui/skeleton";
import type { Question } from "@/dtos/question.dto";
import { QuestionTypeDto } from "@/dtos/question.dto";
import {
  CLASS_QUESTION_SOURCE_LABEL,
  type ClassQuestionDraft,
} from "@/dtos/class-topic-question.dto";

function useQuestionBank(
  courseId: string,
  filters: { moduleId?: string; difficultyLevelId?: string; search?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: questionKeys.list({
      courseId,
      ...filters,
      take: 100,
    }),
    queryFn: () =>
      questionApi.getQuestions({ courseId, ...filters }, 0, 100),
    enabled: enabled && Boolean(courseId),
  });
}

export default function ClassPracticeQuestionComposer({
  courseId,
  drafts,
  onChange,
}: {
  courseId: string;
  drafts: ClassQuestionDraft[];
  onChange: (next: ClassQuestionDraft[]) => void;
}) {
  const [panel, setPanel] = useState<"none" | "bank" | "author" | "ai">("none");

  const existingIds = useMemo(
    () => new Set(drafts.map((d) => d.questionId).filter(Boolean) as string[]),
    [drafts],
  );

  const addBank = (q: Question) => {
    if (existingIds.has(q.id)) {
      toast.error("Câu hỏi đã có trong danh sách");
      return;
    }
    onChange([
      ...drafts,
      {
        key: `bank-${q.id}`,
        source: "bank",
        questionId: q.id,
        content: q.content,
        typeLabel: q.type === "single_choice" ? "Trắc nghiệm" : "Tự luận",
      },
    ]);
  };

  const addAuthored = (payload: {
    moduleId: string;
    difficultyLevelId: string;
    type: QuestionTypeDto;
    content: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    answerGuide?: string;
  }) => {
    onChange([
      ...drafts,
      {
        key: `authored-${crypto.randomUUID()}`,
        source: "authored",
        content: payload.content,
        typeLabel:
          payload.type === "single_choice" ? "Trắc nghiệm" : "Tự luận",
        createPayload: {
          courseId,
          moduleId: payload.moduleId,
          difficultyLevelId: payload.difficultyLevelId,
          type: payload.type,
          content: payload.content,
          options: payload.options,
          correctIndex: payload.correctIndex,
          explanation: payload.explanation,
          answerGuide: payload.answerGuide,
        },
      },
    ]);
    setPanel("none");
    toast.success("Đã thêm câu soạn mới (sẽ ghi vào ngân hàng khoá khi lưu)");
  };

  const addAi = (questions: Question[]) => {
    const next = [...drafts];
    for (const q of questions) {
      if (existingIds.has(q.id) || next.some((d) => d.questionId === q.id)) {
        continue;
      }
      next.push({
        key: `ai-${q.id}`,
        source: "ai",
        questionId: q.id,
        content: q.content,
        typeLabel: q.type === "single_choice" ? "Trắc nghiệm" : "Tự luận",
      });
    }
    onChange(next);
    setPanel("none");
  };

  const remove = (key: string) => {
    onChange(drafts.filter((d) => d.key !== key));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => setPanel(panel === "bank" ? "none" : "bank")}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border-default px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-secondary"
        >
          Từ ngân hàng
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "author" ? "none" : "author")}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border-default px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-secondary"
        >
          ✏ Soạn mới
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "ai" ? "none" : "ai")}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-text-inverse hover:bg-primary-hover"
        >
          ✨ Nhập từ AI
        </button>
      </div>

      {panel === "bank" ? (
        <BankPicker
          courseId={courseId}
          existingIds={existingIds}
          onAdd={addBank}
        />
      ) : null}
      {panel === "author" ? (
        <AuthorForm courseId={courseId} onAdd={addAuthored} />
      ) : null}
      {panel === "ai" ? (
        <AiImportModal
          courseId={courseId}
          variant="inline"
          onClose={() => setPanel("none")}
          onImported={() => undefined}
          onImportedQuestions={addAi}
        />
      ) : null}

      {drafts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-default p-4 text-center text-sm text-text-secondary">
          Chưa có câu hỏi. Chọn từ ngân hàng, soạn mới, hoặc nhập từ AI.
        </p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((draft, index) => (
            <li
              key={draft.key}
              className="rounded-xl border border-border-default/60 bg-bg-primary px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-xs font-medium text-text-muted">
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm text-text-primary">
                    <MathContent content={draft.content} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                      {draft.typeLabel}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {CLASS_QUESTION_SOURCE_LABEL[draft.source]}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(draft.key)}
                  className="shrink-0 rounded p-1 text-text-muted hover:bg-error/10 hover:text-error"
                  aria-label="Gỡ câu hỏi"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BankPicker({
  courseId,
  existingIds,
  onAdd,
}: {
  courseId: string;
  existingIds: Set<string>;
  onAdd: (q: Question) => void;
}) {
  const [chapterFilter, setChapterFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);

  const { data: modules = [] } = useCourseModules(courseId);
  const { data: difficultyLevels = [] } = useCourseDifficultyLevels(courseId);

  const { data: questions = [], isLoading } = useQuestionBank(
    courseId,
    {
      moduleId: chapterFilter || undefined,
      difficultyLevelId: difficultyFilter || undefined,
      search: debouncedSearch || undefined,
    },
    true,
  );

  const available = questions.filter((q) => !existingIds.has(q.id));

  return (
    <div className="rounded-xl border border-border-default bg-bg-surface p-3 space-y-2">
      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm nội dung câu hỏi"
          placeholder="Tìm nội dung câu hỏi..."
          className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <UpgradedSelect
            value={chapterFilter}
            onValueChange={setChapterFilter}
            placeholder="Chuyên đề"
            options={modules.map((ch) => ({ value: ch.id, label: ch.title }))}
            buttonClassName="w-full sm:w-40"
          />
          <UpgradedSelect
            value={difficultyFilter}
            onValueChange={setDifficultyFilter}
            placeholder="Mức khó"
            options={difficultyLevels.map((dl) => ({
              value: dl.id,
              label: dl.name,
            }))}
            buttonClassName="w-full sm:w-36"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto space-y-2">
        {isLoading ? (
          <div
            className="space-y-2 py-1"
            role="status"
            aria-label="Đang tải câu hỏi"
          >
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : available.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            Không còn câu hỏi khả dụng.
          </p>
        ) : (
          available.map((q) => (
            <div
              key={q.id}
              className="flex items-start gap-2 rounded-md border border-border-default/60 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1 line-clamp-2 text-sm">
                <MathContent content={q.content} />
              </div>
              <button
                type="button"
                onClick={() => onAdd(q)}
                className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-text-inverse"
              >
                Thêm
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AuthorForm({
  courseId,
  onAdd,
}: {
  courseId: string;
  onAdd: (payload: {
    moduleId: string;
    difficultyLevelId: string;
    type: QuestionTypeDto;
    content: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    answerGuide?: string;
  }) => void;
}) {
  const [form, setForm] = useState<QuestionFormValue>(emptyQuestionFormValue);
  const patchForm = (patch: Partial<QuestionFormValue>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    if (!form.moduleId || !form.difficultyLevelId || !form.content.trim()) {
      toast.error("Điền chuyên đề, mức khó và nội dung câu hỏi");
      return;
    }
    if (form.type === QuestionTypeDto.single_choice) {
      const options = form.options.map((o) => o.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 6) {
        toast.error("Trắc nghiệm cần 2–6 phương án");
        return;
      }
      if (
        form.correctIndex < 0 ||
        form.correctIndex >= options.length ||
        !form.options[form.correctIndex]?.trim()
      ) {
        toast.error("Đáp án đúng không hợp lệ");
        return;
      }
      onAdd({
        moduleId: form.moduleId,
        difficultyLevelId: form.difficultyLevelId,
        type: form.type,
        content: form.content.trim(),
        options,
        correctIndex: form.correctIndex,
        explanation: form.explanation.trim() || undefined,
        answerGuide: undefined,
      });
      return;
    }
    onAdd({
      moduleId: form.moduleId,
      difficultyLevelId: form.difficultyLevelId,
      type: form.type,
      content: form.content.trim(),
      explanation: form.explanation.trim() || undefined,
      answerGuide: form.answerGuide.trim() || undefined,
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border-default bg-bg-surface p-3">
      <QuestionFormFields
        courseId={courseId}
        value={form}
        onChange={patchForm}
      />
      <button
        type="button"
        onClick={submit}
        className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-text-inverse sm:w-auto"
      >
        Thêm vào đề
      </button>
    </div>
  );
}
