"use client";

import {
  DEFAULT_TRUE_FALSE_LABEL_STYLE,
  ESSAY_INPUT_SIZE_OPTIONS,
  type EssayInputSizeDto,
  QuestionSkillDto,
  QuestionTypeDto,
  TF_LABEL_STYLE_OPTIONS,
  TRUE_FALSE_STATEMENT_LABELS,
  type TrueFalseLabelStyleDto,
  questionTypeLabel,
  trueFalseChoiceLabels,
} from "@/dtos/question.dto";
import FillBlankAnswerFields from "@/components/admin/question/FillBlankAnswerFields";
import OrderingCardFields from "@/components/admin/question/OrderingCardFields";
import { appendBlankMarker, numberBlanks } from "@/lib/fill-blank";
import { useAppConfig } from "@/lib/hooks/useAppConfig";
import { useState, useMemo, useCallback, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as questionApi from "@/lib/apis/question.api";
import QuestionSkillPicker from "@/components/admin/question/QuestionSkillPicker";
import { api } from "@/lib/client";
import { questionKeys, courseKeys } from "@/lib/query-keys";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import {
  useModuleCreateOption,
  useDifficultyCreateOption,
} from "@/lib/hooks/useCourseTaxonomyCreate";
import {
  allQuestionsReviewed,
  DEFAULT_AI_QUESTION_TYPES,
  importDisabledReason,
  remapReviewedAfterRemove,
  revalidateAiQuestion,
  summarizeInvalidQuestions,
  unreviewedCount,
  validateAiJson,
} from "@/lib/ai-import-review.helpers";
import { buildAiImportPrompt } from "@/lib/ai-import-prompt";
import MathContent from "@/components/ui/MathContent";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveDialog,
} from "@/components/ui/ResponsiveDialog";
import {
  confirmUnsavedClose,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import type { Course, CourseDifficultyLevel } from "@/dtos/class.dto";
import {
  AiImportStep,
  type ValidatedAiQuestion,
  type Question,
} from "@/dtos/question.dto";

interface AiImportModalProps {
  courseId: string;
  onClose: () => void;
  onImported: () => void;
  variant?: "modal" | "inline";
  onImportedQuestions?: (questions: Question[]) => void;
}

const STEP_LABEL: Record<AiImportStep, string> = {
  [AiImportStep.prompt]: "Lấy prompt",
  [AiImportStep.paste]: "Dán JSON",
  [AiImportStep.review]: "Soát câu",
};

export default function AiImportModal({
  courseId,
  onClose,
  onImported,
  variant = "modal",
  onImportedQuestions,
}: AiImportModalProps) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<AiImportStep>(AiImportStep.prompt);
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [rawJson, setRawJson] = useState("");
  const [items, setItems] = useState<ValidatedAiQuestion[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [skills, setSkills] = useState<QuestionSkillDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Set<number>>(() => new Set());

  const { data: course } = useQuery({
    queryKey: courseKeys.detail(courseId),
    queryFn: async () => {
      const res = await api.get<Course>(`/courses/${courseId}`);
      return res.data;
    },
  });

  const { data: difficultyLevels = [] } = useCourseDifficultyLevels(courseId);
  const { data: appConfig } = useAppConfig();
  const allowedTypes = useMemo(
    () =>
      (appConfig?.questionTypes as QuestionTypeDto[] | undefined) ??
      DEFAULT_AI_QUESTION_TYPES,
    [appConfig?.questionTypes],
  );

  const { data: modules = [] } = useCourseModules(courseId);

  const chapterOptions = useMemo(
    () =>
      modules.map((chapter) => ({
        value: chapter.id,
        label: chapter.title,
      })),
    [modules],
  );

  const handleChapterChange = useCallback(
    (moduleId: string) => {
      const chapterTitle =
        modules.find((chapter) => chapter.id === moduleId)?.title ?? "";
      setSelectedChapterId(moduleId);
      setTopic(chapterTitle);
    },
    [modules],
  );

  const chapterCreate = useModuleCreateOption(
    courseId,
    (moduleId, title) => {
      setSelectedChapterId(moduleId);
      setTopic(title);
    },
  );

  const difficultyNames = useMemo(
    () => difficultyLevels.map((level) => level.name),
    [difficultyLevels],
  );

  const selectedChapterTitle = useMemo(() => {
    return (
      modules.find((chapter) => chapter.id === selectedChapterId)?.title ??
      topic
    );
  }, [modules, selectedChapterId, topic]);

  const resolveDifficultyId = useCallback(
    (name: string): string => {
      const level = difficultyLevels.find(
        (entry) => entry.name.trim() === name.trim(),
      );
      return level?.id ?? "";
    },
    [difficultyLevels],
  );

  const essayInputSizes = appConfig?.essayInputSizes ?? false;
  const prompt = useMemo(
    () =>
      buildAiImportPrompt({
        courseName: course?.name ?? "N/A",
        topic: selectedChapterTitle,
        questionCount,
        difficultyNames,
        allowedTypes,
        essayInputSizes,
      }),
    [
      allowedTypes,
      course?.name,
      difficultyNames,
      essayInputSizes,
      questionCount,
      selectedChapterTitle,
    ],
  );

  const markViewed = (index: number) => {
    setReviewed((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  const goToIndex = (index: number) => {
    if (items.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), items.length - 1);
    setCurrentIndex(clamped);
    markViewed(clamped);
  };

  const enterReview = (nextItems: ValidatedAiQuestion[]) => {
    setItems(nextItems);
    setCurrentIndex(0);
    setReviewed(nextItems.length > 0 ? new Set([0]) : new Set());
    setStep(AiImportStep.review);
  };

  const handleValidate = () => {
    const result = validateAiJson(rawJson, difficultyNames, allowedTypes);
    if (result.parseError) {
      toast.error(result.parseError);
      return;
    }
    const resolved = result.items.map((item) => ({
      ...item,
      difficultyLevelId: resolveDifficultyId(item.difficultyName),
    }));
    enterReview(resolved);
    const invalidLines = summarizeInvalidQuestions(resolved);
    const validCount = resolved.filter((item) => item._valid).length;
    if (invalidLines.length > 0) {
      toast.error(
        `Phát hiện ${validCount} câu hợp lệ, ${invalidLines.length} câu lỗi. ${invalidLines[0]}`,
      );
    } else {
      toast.success(`Phát hiện ${validCount} câu hợp lệ. Soát từng câu trước khi lưu.`);
    }
  };

  const updateItem = (index: number, patch: Partial<ValidatedAiQuestion>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return revalidateAiQuestion(
          { ...item, ...patch },
          difficultyNames,
          allowedTypes,
        );
      }),
    );
  };

  const removeItem = (index: number) => {
    const nextLength = items.length - 1;
    const nextIndex =
      nextLength <= 0
        ? 0
        : currentIndex > index
          ? currentIndex - 1
          : Math.min(currentIndex, nextLength - 1);
    setItems((prev) => prev.filter((_, i) => i !== index));
    setReviewed((prev) => {
      const remapped = remapReviewedAfterRemove(prev, index);
      if (nextLength > 0) remapped.add(nextIndex);
      return remapped;
    });
    setCurrentIndex(nextIndex);
  };

  const currentQuestionIndex =
    items.length === 0
      ? 0
      : Math.min(Math.max(currentIndex, 0), items.length - 1);
  const currentItem = items[currentQuestionIndex];

  const importMutation = useMutation({
    mutationFn: () => {
      const validItems = items.filter((item) => item._valid);
      return questionApi.bulkCreateQuestions({
        courseId,
        moduleId: selectedChapterId,
        questions: validItems.map((item) => ({
          type: item.type,
          content: item.content,
          options: item.options,
          correctIndex: item.correctIndex,
          tfAnswerKey: item.tfAnswerKey,
          explanation: item.explanation,
          answerGuide: item.answerGuide,
          blankAnswerKey: item.blankAnswerKey,
          essayInputSize: item.essayInputSize,
          tfLabelStyle: item.tfLabelStyle,
          difficultyLevelId: item.difficultyLevelId,
          ...(appConfig?.questionSkills && { skills }),
        })),
      });
    },
    onSuccess: (res) => {
      toast.success(`Đã nhập thành công ${res.count} câu hỏi.`);
      void queryClient.invalidateQueries({
        queryKey: questionKeys.course(courseId),
      });
      onImportedQuestions?.(res.questions ?? []);
      onImported();
    },
    onError: () => {
      toast.error("Lỗi khi nhập câu hỏi. Vui lòng thử lại.");
    },
  });

  const validItems = items.filter((item) => item._valid);
  const invalidItems = items.filter((item) => !item._valid);
  const remainingUnreviewed = unreviewedCount(items.length, reviewed);
  const reviewComplete = allQuestionsReviewed(items.length, reviewed);
  const disabledReason = importDisabledReason({
    remainingUnreviewed,
    moduleId: selectedChapterId,
    skillsMissing: Boolean(appConfig?.questionSkills) && skills.length === 0,
    validCount: validItems.length,
    isPending: importMutation.isPending,
  });
  const canImport = disabledReason === null;
  const isLastReviewQuestion =
    items.length > 0 && currentQuestionIndex >= items.length - 1;
  const showImportButton = isLastReviewQuestion && reviewComplete;
  const reviewedPercent =
    items.length === 0
      ? 0
      : Math.round(((items.length - remainingUnreviewed) / items.length) * 100);

  const handleCopy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Đã sao chép prompt.");
      return true;
    } catch {
      toast.error("Không sao chép được prompt. Hãy chọn và sao chép thủ công.");
      return false;
    }
  };

  const handleCopyAndContinue = async () => {
    const copied = await handleCopy();
    if (copied) setStep(AiImportStep.paste);
  };

  const isInline = variant === "inline";
  const { confirm, dialog } = useConfirmDialog();
  const isDirty =
    step !== AiImportStep.prompt ||
    topic.trim() !== "" ||
    questionCount !== 10 ||
    rawJson.trim() !== "" ||
    items.length > 0;

  const requestClose = async () => {
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const inner = (
    <>
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3 md:px-6">
          <h2 id="ai-import-title" className="text-lg font-bold text-text-primary">
            Nhập câu hỏi từ AI
          </h2>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="inline-flex size-11 items-center justify-center text-text-muted hover:text-text-primary"
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border-default px-4 py-2 md:px-6">
          {(
            [AiImportStep.prompt, AiImportStep.paste, AiImportStep.review] as const
          ).map((entry, idx) => (
            <button
              key={entry}
              type="button"
              onClick={() => {
                if (entry === AiImportStep.prompt) setStep(AiImportStep.prompt);
                if (entry === AiImportStep.paste && rawJson) setStep(AiImportStep.paste);
                if (entry === AiImportStep.review && items.length > 0) {
                  setStep(AiImportStep.review);
                  markViewed(currentQuestionIndex);
                }
              }}
              className={`min-h-11 rounded-full px-3 py-1 text-xs font-medium ${
                step === entry
                  ? "bg-primary text-text-inverse"
                  : "bg-bg-secondary text-text-muted"
              }`}
            >
              {idx + 1}. {STEP_LABEL[entry]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {step === AiImportStep.prompt && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`${formId}-question-count`}
                    className="mb-1 block text-xs font-medium text-text-muted"
                  >
                    Số câu hỏi
                  </label>
                  <input
                    id={`${formId}-question-count`}
                    name="aiQuestionCount"
                    type="number"
                    inputMode="numeric"
                    autoComplete="off"
                    min={1}
                    max={50}
                    value={questionCount}
                    onChange={(e) =>
                      setQuestionCount(
                        Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                      )
                    }
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-prompt-topic`}
                    className="mb-1 block text-xs font-medium text-text-muted"
                  >
                    Chuyên đề / Yêu cầu thêm
                  </label>
                  <UpgradedSelect
                    id={`${formId}-prompt-topic`}
                    searchable
                    value={selectedChapterId}
                    onValueChange={handleChapterChange}
                    options={chapterOptions}
                    placeholder="Gõ để tìm hoặc tạo chuyên đề…"
                    ariaLabel="Chuyên đề để sinh câu hỏi"
                    noResultsLabel="Không tìm thấy chuyên đề phù hợp."
                    {...chapterCreate}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Câu hỏi sẽ được gắn vào chuyên đề này khi lưu.
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor={`${formId}-prompt`}
                    className="text-xs font-medium text-text-muted"
                  >
                    Prompt (nhấn Sao chép để copy)
                  </label>
                  <span className="text-xs text-text-muted">
                    {difficultyNames.length} mức độ khó
                  </span>
                </div>
                <textarea
                  id={`${formId}-prompt`}
                  name="aiPrompt"
                  readOnly
                  value={prompt}
                  autoComplete="off"
                  className="h-64 w-full rounded-md border border-border-default bg-bg-secondary/50 p-3 font-mono text-xs text-text-primary"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => void requestClose()}
                  className="min-h-11 rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary/40"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAndContinue()}
                  className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90"
                >
                  Sao chép & Tiếp tục
                </button>
              </div>
            </div>
          )}

          {step === AiImportStep.paste && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Dán kết quả JSON từ ChatGPT/Claude vào dưới đây. Phải là mảng
                các object{" "}
                <code className="rounded bg-bg-secondary px-1">[{`{...},{...}`}]</code>
                , không bọc mỗi câu trong dấu ngoặc kép. Hệ thống validate ngay
                và báo rõ câu nào, trường nào sai.
              </p>
              <textarea
                id={`${formId}-raw-json`}
                name="aiImportJson"
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                autoComplete="off"
                aria-label="JSON câu hỏi từ AI"
                placeholder='[{"type":"single_choice","content":"...","options":["A","B","C","D"],"correctIndex":0,"difficulty":"Nhận biết"},{"type":"essay","content":"...","answerGuide":"...","difficulty":"Thông hiểu"}]'
                className="h-64 w-full rounded-md border border-border-default bg-bg-surface p-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => setStep(AiImportStep.prompt)}
                  className="min-h-11 rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary/40"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={!rawJson.trim()}
                  className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 disabled:opacity-50"
                >
                  Validate
                </button>
              </div>
            </div>
          )}

          {step === AiImportStep.review && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="success">{validItems.length} hợp lệ</Badge>
                {invalidItems.length > 0 && (
                  <Badge variant="destructive">{invalidItems.length} lỗi</Badge>
                )}
                <span className="text-xs text-text-muted">
                  Đã xem {items.length - remainingUnreviewed}/{items.length}
                </span>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-text-muted">
                    Tiến độ đã review
                  </span>
                  <span className="text-xs text-text-muted">{reviewedPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${reviewedPercent}%` }}
                    role="progressbar"
                    aria-valuenow={items.length - remainingUnreviewed}
                    aria-valuemin={0}
                    aria-valuemax={items.length}
                    aria-label="Tiến độ đã review"
                  />
                </div>
              </div>

              {items.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-text-muted">
                    Tổng quan
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item, index) => {
                      const viewed = reviewed.has(index);
                      const isCurrent = index === currentQuestionIndex;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => goToIndex(index)}
                          title={
                            viewed
                              ? `Câu ${index + 1}: đã xem`
                              : `Câu ${index + 1}: chưa xem`
                          }
                          aria-current={isCurrent ? "step" : undefined}
                          aria-label={`Câu ${index + 1}${viewed ? ", đã xem" : ", chưa xem"}${item._valid ? "" : ", có lỗi"}`}
                          className={`inline-flex size-9 items-center justify-center rounded-md border text-xs font-semibold sm:size-10 ${
                            isCurrent
                              ? "border-primary bg-primary text-text-inverse"
                              : viewed
                                ? item._valid
                                  ? "border-success/40 bg-success/10 text-success"
                                  : "border-error/40 bg-error/10 text-error"
                                : "border-border-default bg-bg-surface text-text-muted"
                          }`}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor={`${formId}-review-topic`}
                  className="mb-1 block text-xs font-medium text-text-muted"
                >
                  Gắn vào Chuyên đề (bắt buộc)
                </label>
                <UpgradedSelect
                  id={`${formId}-review-topic`}
                  searchable
                  value={selectedChapterId}
                  onValueChange={handleChapterChange}
                  options={chapterOptions}
                  placeholder="Gõ để tìm hoặc tạo chuyên đề…"
                  ariaLabel="Chọn chuyên đề để gắn câu hỏi"
                  noResultsLabel="Không tìm thấy chuyên đề phù hợp."
                  {...chapterCreate}
                />
              </div>

              {appConfig?.questionSkills ? (
                <div className="space-y-1">
                  <QuestionSkillPicker value={skills} onChange={setSkills} />
                  <p className="text-xs text-text-muted">
                    Áp dụng cho mọi câu trong lần nhập này.
                  </p>
                </div>
              ) : null}

              {currentItem ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-text-primary">
                      Câu {currentQuestionIndex + 1} / {items.length}
                    </p>
                    {!reviewComplete ? (
                      <p className="text-xs text-text-muted">
                        Soát hết từng câu để mở bước lưu cuối cùng.
                      </p>
                    ) : null}
                  </div>

                  <QuestionReviewCard
                    courseId={courseId}
                    item={currentItem}
                    index={currentQuestionIndex}
                    viewed={reviewed.has(currentQuestionIndex)}
                    difficultyLevels={difficultyLevels}
                    essayInputSizes={essayInputSizes}
                    onUpdate={(patch) =>
                      updateItem(currentQuestionIndex, patch)
                    }
                    onRemove={() => removeItem(currentQuestionIndex)}
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border-default p-4 text-center text-sm text-text-secondary">
                  Không còn câu nào để soát. Quay lại bước dán JSON.
                </p>
              )}
            </div>
          )}
        </div>

        {step === AiImportStep.review && (
          <div className="flex flex-col gap-2 border-t border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <button
              type="button"
              onClick={() => setStep(AiImportStep.paste)}
              className="min-h-11 rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary/40"
            >
              Quay lại
            </button>
            <div className="flex min-w-0 flex-col items-stretch gap-1 sm:items-end">
              {disabledReason && !importMutation.isPending && (
                <p className="text-xs text-text-muted">{disabledReason}</p>
              )}
              {showImportButton ? (
                <button
                  type="button"
                  onClick={() => importMutation.mutate()}
                  disabled={!canImport}
                  title={disabledReason ?? "Lưu vào ngân hàng"}
                  className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
                >
                  {importMutation.isPending ? "Đang nhập…" : "Lưu vào ngân hàng"}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <button
                    type="button"
                    onClick={() => goToIndex(currentQuestionIndex - 1)}
                    disabled={currentQuestionIndex === 0}
                    className="min-h-11 rounded-md bg-info px-4 py-2 text-sm font-medium text-text-inverse hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-info/40 disabled:text-text-inverse/80"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    onClick={() => goToIndex(currentQuestionIndex + 1)}
                    disabled={items.length === 0 || currentQuestionIndex >= items.length - 1}
                    className="min-h-11 rounded-md bg-info px-4 py-2 text-sm font-medium text-text-inverse hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-info/40 disabled:text-text-inverse/80"
                  >
                    Sau
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
    </>
  );

  return (
    <>
      {isInline ? (
        <div className="flex max-h-[70vh] w-full flex-col overflow-hidden rounded-xl border border-border-default bg-bg-surface">
          {inner}
        </div>
      ) : (
        <ResponsiveDialog
          size="4xl"
          labelledBy="ai-import-title"
          onBackdropClick={() => void requestClose()}
        >
          {inner}
        </ResponsiveDialog>
      )}
      {dialog}
    </>
  );
}

function QuestionReviewCard({
  courseId,
  item,
  index,
  viewed,
  difficultyLevels,
  essayInputSizes,
  onUpdate,
  onRemove,
}: {
  courseId: string;
  item: ValidatedAiQuestion;
  index: number;
  viewed: boolean;
  difficultyLevels: CourseDifficultyLevel[];
  /** Hồ sơ có kiểu ô tự luận ngắn/dài (JP). */
  essayInputSizes: boolean;
  onUpdate: (patch: Partial<ValidatedAiQuestion>) => void;
  onRemove: () => void;
}) {
  const fieldId = useId();
  const diffOptions = difficultyLevels.map((level) => ({
    value: level.id,
    label: level.name,
  }));
  const difficultyCreate = useDifficultyCreateOption(
    courseId,
    (difficultyLevelId, name) =>
      onUpdate({ difficultyLevelId, difficultyName: name }),
  );

  return (
    <div
      className={`rounded-lg border ${
        item._valid
          ? "border-border-default"
          : "border-error/50 bg-error/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs font-medium text-text-muted">#{index + 1}</span>
        <Badge variant={item.type === "single_choice" ? "info" : "success"}>
          {questionTypeLabel(item.type)}
        </Badge>
        <Badge variant={viewed ? "success" : "secondary"}>
          {viewed ? "Đã xem" : "Chưa xem"}
        </Badge>
        {!item._valid && (
          <Badge variant="destructive">{item._errors.length} lỗi</Badge>
        )}
      </div>

      {!item._valid && item._errors.length > 0 && (
        <div className="border-t border-border-default px-4 py-2">
          {item._errors.map((err, i) => (
            <p key={i} className="text-xs text-error">
              Câu {index + 1}: {err}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-3 border-t border-border-default px-4 py-3">
        <div>
          <label
            htmlFor={`${fieldId}-content`}
            className="mb-1 block text-xs font-medium text-text-muted"
          >
            Nội dung
          </label>
          <textarea
            id={`${fieldId}-content`}
            name={`aiQuestion${index + 1}Content`}
            value={item.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            rows={3}
            autoComplete="off"
            className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
          />
          {item.content.trim() ? (
            <div className="mt-2 rounded-md bg-bg-secondary/40 p-2">
              <MathContent
                content={
                  item.type === QuestionTypeDto.fill_blank
                    ? numberBlanks(item.content)
                    : item.content
                }
                className="text-sm"
              />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${fieldId}-difficulty`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Độ khó
            </label>
            <UpgradedSelect
              id={`${fieldId}-difficulty`}
              value={item.difficultyLevelId}
              onValueChange={(value) => {
                const level = difficultyLevels.find((entry) => entry.id === value);
                onUpdate({
                  difficultyLevelId: value,
                  difficultyName: level?.name ?? "",
                });
              }}
              options={diffOptions}
              placeholder="Gõ để tìm hoặc tạo độ khó"
              ariaLabel="Độ khó"
              searchable
              {...difficultyCreate}
            />
          </div>
          {item.type === "single_choice" && (
            <div>
              <label
                htmlFor={`${fieldId}-correct-answer`}
                className="mb-1 block text-xs font-medium text-text-muted"
              >
                Đáp án đúng
              </label>
              <UpgradedSelect
                id={`${fieldId}-correct-answer`}
                value={String(item.correctIndex ?? 0)}
                onValueChange={(value) =>
                  onUpdate({ correctIndex: Number(value) })
                }
                options={
                  item.options?.map((opt, i) => ({
                    value: String(i),
                    label: `${String.fromCharCode(65 + i)}. ${opt.slice(0, 40)}`,
                  })) ?? []
                }
                ariaLabel="Đáp án đúng"
              />
            </div>
          )}
        </div>

        {item.type === "single_choice" && item.options && (
          <div>
            <p className="mb-1 block text-xs font-medium text-text-muted">
              Phương án
            </p>
            <div className="space-y-2">
              {item.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label
                    htmlFor={`${fieldId}-option-${i}`}
                    className="w-6 text-center text-xs font-bold text-text-muted"
                  >
                    {String.fromCharCode(65 + i)}
                  </label>
                  <input
                    id={`${fieldId}-option-${i}`}
                    name={`aiQuestion${index + 1}Option${i + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...(item.options ?? [])];
                      newOpts[i] = e.target.value;
                      onUpdate({ options: newOpts });
                    }}
                    autoComplete="off"
                    className="min-h-11 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {item.type === "true_false_group" && (
          <div>
            <p className="mb-1 block text-xs font-medium text-text-muted">
              Nhận định và đáp án
            </p>
            <div className="space-y-2">
              {TRUE_FALSE_STATEMENT_LABELS.map((label, i) => {
                const key = item.tfAnswerKey?.[i];
                return (
                  <div key={label} className="flex items-start gap-2">
                    <label
                      htmlFor={`${fieldId}-statement-${i}`}
                      className="mt-3 w-6 text-center text-xs font-bold text-text-muted"
                    >
                      {label})
                    </label>
                    <input
                      id={`${fieldId}-statement-${i}`}
                      value={item.options?.[i] ?? ""}
                      onChange={(e) => {
                        const next = [0, 1, 2, 3].map(
                          (j) => item.options?.[j] ?? "",
                        );
                        next[i] = e.target.value;
                        onUpdate({ options: next });
                      }}
                      autoComplete="off"
                      className="min-h-11 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`Đáp án nhận định ${label}: ${key ? "Đúng" : "Sai"} — bấm để đổi`}
                      onClick={() => {
                        const next = [0, 1, 2, 3].map(
                          (j) => item.tfAnswerKey?.[j] ?? true,
                        );
                        next[i] = !next[i];
                        onUpdate({ tfAnswerKey: next });
                      }}
                      className={`min-h-11 min-w-14 rounded-md border px-2 text-xs font-semibold ${
                        key
                          ? "border-success/40 text-success"
                          : "border-error/40 text-error"
                      }`}
                    >
                      {key ? "Đúng" : "Sai"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {item.type === QuestionTypeDto.true_false && (
          <TrueFalseReviewFields item={item} onUpdate={onUpdate} />
        )}

        {item.type === QuestionTypeDto.fill_blank && (
          <FillBlankAnswerFields
            content={item.content}
            blankAnswerKey={item.blankAnswerKey ?? []}
            onChange={(blankAnswerKey) => onUpdate({ blankAnswerKey })}
            onInsertBlank={() =>
              onUpdate({ content: appendBlankMarker(item.content) })
            }
          />
        )}

        {item.type === QuestionTypeDto.ordering && (
          <OrderingCardFields
            cards={item.options ?? []}
            onChange={(options) => onUpdate({ options })}
          />
        )}

        {item.type === QuestionTypeDto.essay && essayInputSizes && (
          <div>
            <label
              htmlFor={`${fieldId}-essay-size`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Kiểu ô trả lời
            </label>
            <UpgradedSelect
              id={`${fieldId}-essay-size`}
              value={item.essayInputSize ?? "long"}
              onValueChange={(value) =>
                onUpdate({ essayInputSize: value as EssayInputSizeDto })
              }
              options={ESSAY_INPUT_SIZE_OPTIONS}
              ariaLabel="Kiểu ô trả lời"
            />
          </div>
        )}

        {item.type !== "essay" && (
          <div>
            <label
              htmlFor={`${fieldId}-explanation`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Giải thích
            </label>
            <textarea
              id={`${fieldId}-explanation`}
              name={`aiQuestion${index + 1}Explanation`}
              value={item.explanation ?? ""}
              onChange={(e) => onUpdate({ explanation: e.target.value })}
              rows={2}
              autoComplete="off"
              className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            />
          </div>
        )}
        {item.type === "essay" && item.options !== undefined && (
          <div className="rounded-md border border-error/30 bg-error/5 p-3">
            <p className="text-xs text-error">
              Câu tự luận không được có options. Gỡ để câu hợp lệ.
            </p>
            <button
              type="button"
              onClick={() => onUpdate({ options: undefined })}
              className="mt-2 min-h-11 text-xs font-medium text-error hover:underline"
            >
              Gỡ options thừa
            </button>
          </div>
        )}
        {item.type === "essay" && item.correctIndex !== undefined && (
          <div className="rounded-md border border-error/30 bg-error/5 p-3">
            <p className="text-xs text-error">
              Câu tự luận không được có correctIndex.
            </p>
            <button
              type="button"
              onClick={() => onUpdate({ correctIndex: undefined })}
              className="mt-2 min-h-11 text-xs font-medium text-error hover:underline"
            >
              Gỡ correctIndex thừa
            </button>
          </div>
        )}
        {item.type === "essay" && (
          <div>
            <label
              htmlFor={`${fieldId}-answer-guide`}
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Hướng dẫn trả lời
            </label>
            <textarea
              id={`${fieldId}-answer-guide`}
              name={`aiQuestion${index + 1}AnswerGuide`}
              value={item.answerGuide ?? ""}
              onChange={(e) => onUpdate({ answerGuide: e.target.value })}
              rows={2}
              autoComplete="off"
              className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
            />
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="min-h-11 text-xs text-error hover:underline"
          >
            Xóa câu này
          </button>
        </div>
      </div>
    </div>
  );
}

/** Câu Đúng/Sai một nhận định: nhận định ở nội dung; chọn đáp án + kiểu nhãn. */
function TrueFalseReviewFields({
  item,
  onUpdate,
}: {
  item: ValidatedAiQuestion;
  onUpdate: (patch: Partial<ValidatedAiQuestion>) => void;
}) {
  const labels = trueFalseChoiceLabels(item.tfLabelStyle);
  const answer = item.tfAnswerKey?.length === 1 ? item.tfAnswerKey[0] : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Đáp án đúng
        </span>
        <div
          role="radiogroup"
          aria-label="Đáp án đúng"
          className="grid grid-cols-2 gap-2"
        >
          {([true, false] as const).map((v, i) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={answer === v}
              onClick={() => onUpdate({ tfAnswerKey: [v] })}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
                answer === v
                  ? "border-primary bg-primary text-text-inverse"
                  : "border-border-default text-text-secondary hover:border-primary/50"
              }`}
            >
              {labels[i]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Kiểu nhãn
        </span>
        <UpgradedSelect
          value={item.tfLabelStyle ?? DEFAULT_TRUE_FALSE_LABEL_STYLE}
          onValueChange={(value) =>
            onUpdate({ tfLabelStyle: value as TrueFalseLabelStyleDto })
          }
          options={TF_LABEL_STYLE_OPTIONS}
          ariaLabel="Kiểu nhãn"
        />
      </div>
    </div>
  );
}
