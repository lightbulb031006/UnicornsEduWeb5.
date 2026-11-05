"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { Layers } from "lucide-react";
import { questionKeys, sharedMaterialKeys } from "@/lib/query-keys";
import * as classApi from "@/lib/apis/class.api";
import * as questionApi from "@/lib/apis/question.api";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { useAppConfig } from "@/lib/hooks/useAppConfig";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import MathContent from "@/components/ui/MathContent";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { questionTypeLabel } from "@/dtos/question.dto";

function useQuestionBank(
  courseId: string,
  filters: { moduleId?: string; difficultyLevelId?: string; search?: string },
) {
  return useQuery({
    // Câu của bộ vào tiết theo cả bộ → chỉ liệt kê câu lẻ.
    queryKey: questionKeys.list({
      courseId,
      ...filters,
      standalone: "true",
      take: 100,
    }),
    queryFn: () =>
      questionApi.getQuestions(
        { courseId, ...filters, standalone: "true" },
        0,
        100,
      ),
    enabled: Boolean(courseId),
  });
}

export function AddPracticeQuestionDialog({
  lessonId,
  courseId,
  existingLinkQuestionIds,
  existingSetIds,
  assigned,
  onClose,
  onAdded,
}: {
  lessonId: string;
  courseId: string;
  existingLinkQuestionIds: string[];
  /** Bộ câu hỏi đã có trong tiết. */
  existingSetIds: string[];
  assigned: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [moduleFilter, setModuleFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);

  const { data: modules = [] } = useCourseModules(courseId);
  const { data: difficultyLevels = [] } = useCourseDifficultyLevels(courseId);

  const { data: questions = [], isLoading: isBankLoading } = useQuestionBank(courseId, {
    moduleId: moduleFilter || undefined,
    difficultyLevelId: difficultyFilter || undefined,
    search: debouncedSearch || undefined,
  });

  // Set: tra cứu O(1) thay vì quét lại danh sách câu đã gắn cho từng câu hỏi.
  // Không useMemo: prop này là mảng mới mỗi render nên memo không giữ được cache.
  const existingLinkQuestionIdSet = new Set(existingLinkQuestionIds);
  const available = questions.filter(
    (q) => !existingLinkQuestionIdSet.has(q.id),
  );

  const { data: appConfig } = useAppConfig();
  const setsEnabled = appConfig?.sharedMaterials ?? false;
  const { data: sets = [] } = useQuery({
    queryKey: sharedMaterialKeys.course(courseId),
    queryFn: () => sharedMaterialApi.getSharedMaterials(courseId),
    enabled: setsEnabled && Boolean(courseId),
  });
  const existingSetIdSet = new Set(existingSetIds);
  const needle = debouncedSearch.toLowerCase();
  const availableSets = sets.filter(
    (set) =>
      set.questionCount > 0 &&
      !existingSetIdSet.has(set.id) &&
      (!moduleFilter || set.moduleId === moduleFilter) &&
      (!needle || set.title.toLowerCase().includes(needle)),
  );

  const addMutation = useMutation({
    mutationFn: (questionId: string) =>
      classApi.addPracticeLessonQuestion(lessonId, { questionId }),
    onSuccess: () => {
      toast.success("Đã thêm câu hỏi.");
      onAdded();
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thể thêm câu hỏi.")),
  });

  const addSetMutation = useMutation({
    mutationFn: (setId: string) =>
      classApi.addPracticeLessonQuestionSet(lessonId, setId),
    onSuccess: () => {
      toast.success("Đã thêm bộ câu hỏi.");
      onAdded();
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thể thêm bộ câu hỏi.")),
  });

  return (
    <ResponsiveDialog
      size="2xl"
      labelledBy="add-practice-question-title"
      onBackdropClick={onClose}
    >
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h3
            id="add-practice-question-title"
            className="text-sm font-semibold text-text-primary"
          >
            Thêm câu hỏi từ ngân hàng
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-tertiary"
            aria-label="Đóng"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="border-b border-border-default px-4 py-2.5">
          {assigned ? (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <svg className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Đề này đã được giao cho lớp. Thêm câu hỏi sẽ ảnh hưởng đến các lần giao đang chạy.
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm nội dung câu hỏi"
              placeholder="Tìm nội dung câu hỏi..."
              className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            />
            <div className="flex gap-2">
              <UpgradedSelect
                value={moduleFilter}
                onValueChange={setModuleFilter}
                placeholder="Chuyên đề"
                options={modules.map((ch) => ({
                  value: ch.id,
                  label: ch.title,
                }))}
                buttonClassName="w-40"
              />
              <UpgradedSelect
                value={difficultyFilter}
                onValueChange={setDifficultyFilter}
                placeholder="Mức khó"
                options={difficultyLevels.map((dl) => ({
                  value: dl.id,
                  label: dl.name,
                }))}
                buttonClassName="w-36"
              />
            </div>
          </div>
        </div>

        <ResponsiveDialogBody className="px-4 py-2">
          {isBankLoading ? (
            <div
              className="space-y-2 py-2"
              role="status"
              aria-label="Đang tải câu hỏi"
            >
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : available.length === 0 && availableSets.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">
              {questions.length === 0
                ? "Không có câu hỏi nào trong ngân hàng."
                : "Tất cả câu hỏi đã được thêm."}
            </p>
          ) : (
            <ul className="space-y-2">
              {availableSets.map((set) => (
                <li
                  key={set.id}
                  className="flex items-start gap-3 rounded-md border border-info/30 bg-info/5 px-3 py-2.5"
                >
                  <Layers className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {set.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-text-muted">
                      Bộ · {set.questionCount} câu
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={addSetMutation.isPending}
                    onClick={() => addSetMutation.mutate(set.id)}
                    className="inline-flex min-h-9 shrink-0 items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60"
                  >
                    {addSetMutation.isPending && addSetMutation.variables === set.id
                      ? "Đang lưu…"
                      : "Thêm bộ"}
                  </button>
                </li>
              ))}
              {available.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start gap-3 rounded-md border border-border-default/60 bg-bg-primary px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm text-text-primary">
                      <MathContent content={q.content} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        {questionTypeLabel(q.type)}
                      </span>
                      {q.options && Array.isArray(q.options) ? (
                        <span className="text-[10px] text-text-muted">
                          {q.options.length} đáp án
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate(q.id)}
                    className="inline-flex min-h-9 shrink-0 items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60"
                  >
                    {addMutation.isPending && addMutation.variables === q.id
                      ? "Đang lưu…"
                      : "Thêm"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ResponsiveDialogBody>

        <ResponsiveActionFooter className="min-[380px]:grid-cols-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-default px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary"
          >
            Đóng
          </button>
        </ResponsiveActionFooter>
    </ResponsiveDialog>
  );
}
