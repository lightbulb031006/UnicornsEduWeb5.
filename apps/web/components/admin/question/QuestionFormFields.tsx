"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";

import ClassTabList from "@/components/class-timeline/ClassTabList";
import QuestionPreview from "@/components/admin/question/QuestionPreview";
import MathRichTextEditor from "@/components/ui/MathRichTextEditor";
import { useQuestionImageUpload } from "@/lib/hooks/useQuestionImageUpload";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import QuestionSkillPicker from "@/components/admin/question/QuestionSkillPicker";
import OrderingCardFields from "@/components/admin/question/OrderingCardFields";
import FillBlankAnswerFields from "@/components/admin/question/FillBlankAnswerFields";
import { appendBlankMarker } from "@/lib/fill-blank";
import {
  ESSAY_INPUT_SIZE_OPTIONS,
  type EssayInputSizeDto,
  QUESTION_TYPE_LABELS,
  QuestionSkillDto,
  QuestionTypeDto,
  TRUE_FALSE_CHOICE_LABELS,
  TRUE_FALSE_STATEMENT_LABELS,
  TF_LABEL_STYLE_OPTIONS,
  type TrueFalseLabelStyleDto,
} from "@/dtos/question.dto";
import { useAppConfig } from "@/lib/hooks/useAppConfig";
import type { AudioRef } from "@/dtos/audio-asset.dto";
import { useSharedMaterials } from "@/lib/hooks/useSharedMaterials";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import {
  useModuleCreateOption,
  useDifficultyCreateOption,
} from "@/lib/hooks/useCourseTaxonomyCreate";

export type QuestionFormValue = {
  moduleId: string;
  difficultyLevelId: string;
  type: QuestionTypeDto;
  content: string;
  options: string[];
  correctIndex: number;
  /** 4 nhận định a–d của câu Đúng/Sai (gửi lên API qua `options`). */
  statements: string[];
  /** Nhóm 4 nhận định: 4 phần tử. Câu Đúng/Sai (JP): chỉ đọc phần tử đầu. */
  tfAnswerKey: boolean[];
  /** Kiểu nhãn Câu Đúng/Sai (JP). */
  tfLabelStyle: TrueFalseLabelStyleDto;
  /** Đáp án hợp lệ từng ô của câu điền vào ô trống (JP). */
  blankAnswerKey: string[][];
  explanation: string;
  answerGuide: string;
  /** Kỹ năng (chỉ hồ sơ JP). */
  skills: QuestionSkillDto[];
  /** Kiểu ô nhập câu tự luận (chỉ hồ sơ JP). Câu mới mặc định ngắn. */
  essayInputSize: EssayInputSizeDto;
  /** Bộ câu hỏi của câu (JP, chỉ đọc); "" = câu lẻ. Đổi bộ qua chuyển vào / ra bộ. */
  sharedMaterialId: string;
  /** Audio cũ của câu (JP, chỉ đọc — chỉ để xem trước); null = không có. */
  audio: AudioRef | null;
};

export const emptyQuestionFormValue: QuestionFormValue = {
  moduleId: "",
  difficultyLevelId: "",
  type: QuestionTypeDto.single_choice,
  content: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  statements: ["", "", "", ""],
  tfAnswerKey: [true, true, true, true],
  tfLabelStyle: "maru_batsu",
  blankAnswerKey: [],
  explanation: "",
  answerGuide: "",
  skills: [],
  essayInputSize: "short",
  sharedMaterialId: "",
  audio: null,
};

const FORM_VIEWS = ["edit", "preview"] as const;
type FormView = (typeof FORM_VIEWS)[number];
const FORM_VIEW_LABELS: Record<FormView, string> = {
  edit: "Soạn thảo",
  preview: "Xem trước",
};

/**
 * Thân form soạn câu hỏi dùng chung cho popup Ngân hàng câu hỏi và composer
 * tiết thực hành của lớp. Chọn khoá học nằm ngoài (`courseSlot`) vì
 * composer khoá cứng khoá theo lớp.
 */
export default function QuestionFormFields({
  courseId,
  value,
  onChange,
  courseSlot,
  questionId,
}: {
  courseId: string;
  value: QuestionFormValue;
  onChange: (patch: Partial<QuestionFormValue>) => void;
  courseSlot?: ReactNode;
  /** Câu đang sửa (chưa có khi tạo mới) — để nhận ra vị trí trống nối tới câu. */
  questionId?: string;
}) {
  const viewIdPrefix = useId();
  const viewPanelId = `${viewIdPrefix}-panel`;
  const [view, setView] = useState<FormView>("edit");
  const { data: appConfig } = useAppConfig();
  const maxOptions = appConfig?.optionCount.max ?? 6;
  const minOptions = appConfig?.optionCount.min ?? 2;
  // Hồ sơ quyết định loại câu (IT: không tự luận). Giữ loại đang sửa để câu cũ vẫn hiện.
  const allowedTypes = (appConfig?.questionTypes ?? [
    QuestionTypeDto.single_choice,
    QuestionTypeDto.essay,
  ]) as QuestionTypeDto[];
  const typeOptions = Object.values(QuestionTypeDto)
    .filter((t) => allowedTypes.includes(t) || t === value.type)
    .map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }));
  const uploadImage = useQuestionImageUpload(courseId || undefined);
  const { data: modules = [] } = useCourseModules(courseId || undefined);
  const { data: difficultyLevels = [] } = useCourseDifficultyLevels(
    courseId || undefined,
  );

  const chapterCreate = useModuleCreateOption(courseId || undefined, (id) =>
    onChange({ moduleId: id }),
  );
  const difficultyCreate = useDifficultyCreateOption(
    courseId || undefined,
    (id) => onChange({ difficultyLevelId: id }),
  );

  const sharedMaterialsEnabled = appConfig?.sharedMaterials ?? false;
  // Chỉ để xem trước phần đầu bộ của câu trong bộ.
  const { data: materials = [] } = useSharedMaterials(
    courseId || undefined,
    sharedMaterialsEnabled && Boolean(value.sharedMaterialId),
  );
  const selectedMaterial = materials.find(
    (m) => m.id === value.sharedMaterialId,
  );

  const chapterOptions = modules.map((ch) => ({
    value: ch.id,
    label: ch.title,
  }));
  const difficultyOptions = difficultyLevels.map((d) => ({
    value: d.id,
    label: d.name,
  }));

  const updateOption = (index: number, next: string) => {
    const options = [...value.options];
    options[index] = next;
    onChange({ options });
  };

  const addOption = () => {
    if (value.options.length < maxOptions)
      onChange({ options: [...value.options, ""] });
  };

  const removeOption = (index: number) => {
    if (value.options.length <= minOptions) return;
    const options = value.options.filter((_, i) => i !== index);
    onChange({
      options,
      correctIndex:
        value.correctIndex >= options.length
          ? options.length - 1
          : value.correctIndex,
    });
  };

  return (
    <div className="space-y-4">
      <ClassTabList
        tabs={FORM_VIEWS}
        labels={FORM_VIEW_LABELS}
        activeTab={view}
        onSelect={setView}
        idPrefix={viewIdPrefix}
        panelId={viewPanelId}
        ariaLabel="Chế độ soạn câu hỏi"
      />
      <div
        id={viewPanelId}
        role="tabpanel"
        aria-labelledby={`${viewIdPrefix}-${view}`}
      >
        {view === "preview" ? (
          <QuestionPreview
            value={value}
            sharedMaterialContent={selectedMaterial?.content}
            sharedMaterialAudioUrl={selectedMaterial?.audio?.url}
            questionId={questionId}
          />
        ) : (
          <div className="space-y-4">
            <div
              className={`grid grid-cols-1 gap-3 ${courseSlot ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
            >
              {courseSlot}
              <div>
                <span className="mb-1 block text-xs font-medium text-text-muted">
                  Chuyên đề
                </span>
                <UpgradedSelect
                  searchable
                  value={value.moduleId}
                  onValueChange={(v) => onChange({ moduleId: v })}
                  options={chapterOptions}
                  placeholder="Gõ để tìm hoặc tạo chuyên đề"
                  // Câu trong bộ theo chuyên đề của bộ — đổi ở form bộ.
                  disabled={!courseId || Boolean(value.sharedMaterialId)}
                  ariaLabel="Chuyên đề"
                  {...chapterCreate}
                />
                {value.sharedMaterialId ? (
                  <p className="mt-1 text-xs text-text-muted">
                    Theo chuyên đề của bộ.
                  </p>
                ) : null}
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-text-muted">
                  Độ khó
                </span>
                <UpgradedSelect
                  searchable
                  value={value.difficultyLevelId}
                  onValueChange={(v) => onChange({ difficultyLevelId: v })}
                  options={difficultyOptions}
                  placeholder="Gõ để tìm hoặc tạo độ khó"
                  disabled={!courseId}
                  ariaLabel="Độ khó"
                  {...difficultyCreate}
                />
              </div>
            </div>

            {appConfig?.questionSkills ? (
              <QuestionSkillPicker
                value={value.skills}
                onChange={(skills) => onChange({ skills })}
              />
            ) : null}

            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Loại câu hỏi
              </span>
              <UpgradedSelect
                value={value.type}
                onValueChange={(v) => onChange({ type: v as QuestionTypeDto })}
                options={typeOptions}
                ariaLabel="Loại câu hỏi"
              />
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Nội dung câu hỏi (hỗ trợ LaTeX: $x^2$)
              </span>
              <MathRichTextEditor
                value={value.content}
                onChange={(next) => onChange({ content: next })}
                ariaLabel="Nội dung câu hỏi"
                onUploadImage={uploadImage}
                placeholder="Nhập nội dung câu hỏi..."
                minHeight="min-h-[120px]"
              />
            </div>

            {value.type === QuestionTypeDto.single_choice && (
              <div className="space-y-2">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-xs font-medium text-text-muted">
                    Phương án ({value.options.length}/{maxOptions})
                  </span>
                  <span className="text-xs text-text-muted">
                    Bấm ô tick để chọn đáp án đúng
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Đáp án đúng"
                  className="space-y-2"
                >
                  {value.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-center text-sm font-bold text-text-muted">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                          value.correctIndex === i
                            ? "border-success bg-success/5"
                            : "border-border-default bg-bg-surface"
                        }`}
                        aria-label={`Phương án ${String.fromCharCode(65 + i)}`}
                        placeholder={`Phương án ${String.fromCharCode(65 + i)}`}
                      />
                      <CorrectOptionToggle
                        label={String.fromCharCode(65 + i)}
                        checked={value.correctIndex === i}
                        onSelect={() => onChange({ correctIndex: i })}
                      />
                      {value.options.length > minOptions && (
                        <button
                          type="button"
                          onClick={() => removeOption(i)}
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                          aria-label={`Xoá phương án ${String.fromCharCode(65 + i)}`}
                          title={`Xoá phương án ${String.fromCharCode(65 + i)}`}
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {value.options.length < maxOptions && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="text-sm text-primary hover:underline"
                  >
                    + Thêm phương án
                  </button>
                )}
              </div>
            )}

            {value.type === QuestionTypeDto.true_false_group && (
              <TrueFalseStatementFields
                value={value}
                onChange={onChange}
                uploadImage={uploadImage}
              />
            )}

            {value.type === QuestionTypeDto.true_false && (
              <TrueFalseSingleFields value={value} onChange={onChange} />
            )}

            {value.type === QuestionTypeDto.ordering && (
              <OrderingCardFields
                cards={value.options}
                onChange={(options) => onChange({ options })}
              />
            )}

            {value.type === QuestionTypeDto.fill_blank && (
              <FillBlankAnswerFields
                content={value.content}
                blankAnswerKey={value.blankAnswerKey}
                onChange={(blankAnswerKey) => onChange({ blankAnswerKey })}
                onInsertBlank={() =>
                  onChange({ content: appendBlankMarker(value.content) })
                }
              />
            )}

            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Giải thích (tuỳ chọn)
              </span>
              <MathRichTextEditor
                value={value.explanation}
                onChange={(next) => onChange({ explanation: next })}
                ariaLabel="Giải thích"
                onUploadImage={uploadImage}
                placeholder="Giải thích đáp án..."
                minHeight="min-h-[80px]"
              />
            </div>

            {value.type === QuestionTypeDto.essay &&
            appConfig?.essayInputSizes ? (
              <div>
                <span className="mb-1 block text-xs font-medium text-text-muted">
                  Kiểu ô trả lời
                </span>
                <UpgradedSelect
                  value={value.essayInputSize}
                  onValueChange={(v) =>
                    onChange({ essayInputSize: v as EssayInputSizeDto })
                  }
                  options={ESSAY_INPUT_SIZE_OPTIONS}
                  ariaLabel="Kiểu ô trả lời"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Chỉ đổi giao diện làm bài, không giới hạn độ dài và không ảnh
                  hưởng chấm.
                </p>
              </div>
            ) : null}

            {value.type === QuestionTypeDto.essay && (
              <div>
                <span className="mb-1 block text-xs font-medium text-text-muted">
                  Hướng dẫn trả lời (tuỳ chọn)
                </span>
                <MathRichTextEditor
                  value={value.answerGuide}
                  onChange={(next) => onChange({ answerGuide: next })}
                  ariaLabel="Hướng dẫn trả lời"
                  onUploadImage={uploadImage}
                  placeholder="Hướng dẫn cho câu tự luận..."
                  minHeight="min-h-[80px]"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 4 nhận định a–d (rich text: bảng/code/công thức) + công tắc Đúng/Sai cho từng ý. */
function TrueFalseStatementFields({
  value,
  onChange,
  uploadImage,
}: {
  value: QuestionFormValue;
  onChange: (patch: Partial<QuestionFormValue>) => void;
  uploadImage: ReturnType<typeof useQuestionImageUpload>;
}) {
  const setStatement = (index: number, next: string) => {
    const statements = [...value.statements];
    statements[index] = next;
    onChange({ statements });
  };
  const setKey = (index: number, next: boolean) => {
    const tfAnswerKey = [...value.tfAnswerKey];
    tfAnswerKey[index] = next;
    onChange({ tfAnswerKey });
  };

  return (
    <div className="space-y-3">
      <span className="block text-xs font-medium text-text-muted">
        4 nhận định và đáp án
      </span>
      {TRUE_FALSE_STATEMENT_LABELS.map((label, i) => (
        <div
          key={label}
          className="space-y-2 rounded-xl border border-border-default p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-text-muted">{label})</span>
            <div
              role="radiogroup"
              aria-label={`Đáp án nhận định ${label}`}
              className="flex gap-2"
            >
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={value.tfAnswerKey[i] === v}
                  onClick={() => setKey(i, v)}
                  className={`min-h-9 min-w-14 rounded-lg border px-3 text-sm font-medium ${
                    value.tfAnswerKey[i] === v
                      ? "border-primary bg-primary text-text-inverse"
                      : "border-border-default text-text-secondary hover:border-primary/50"
                  }`}
                >
                  {v ? "Đúng" : "Sai"}
                </button>
              ))}
            </div>
          </div>
          <MathRichTextEditor
            value={value.statements[i] ?? ""}
            onChange={(next) => setStatement(i, next)}
            ariaLabel={`Nhận định ${label}`}
            onUploadImage={uploadImage}
            placeholder={`Nhận định ${label}...`}
            minHeight="min-h-[60px]"
          />
        </div>
      ))}
    </div>
  );
}

/** Câu Đúng/Sai (JP): nhận định nằm ở nội dung câu; chọn đáp án + kiểu nhãn. */
function TrueFalseSingleFields({
  value,
  onChange,
}: {
  value: QuestionFormValue;
  onChange: (patch: Partial<QuestionFormValue>) => void;
}) {
  const labels = TRUE_FALSE_CHOICE_LABELS[value.tfLabelStyle];
  const answer = value.tfAnswerKey[0] ?? true;
  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Đáp án đúng
        </span>
        <div
          role="radiogroup"
          aria-label="Đáp án đúng"
          className="grid grid-cols-2 gap-2 sm:flex"
        >
          {([true, false] as const).map((v, i) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={answer === v}
              onClick={() =>
                onChange({ tfAnswerKey: [v, ...value.tfAnswerKey.slice(1)] })
              }
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium sm:min-w-24 ${
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
          value={value.tfLabelStyle}
          onValueChange={(v) =>
            onChange({ tfLabelStyle: v as TrueFalseLabelStyleDto })
          }
          options={TF_LABEL_STYLE_OPTIONS}
          ariaLabel="Kiểu nhãn"
        />
      </div>
    </div>
  );
}

/**
 * Ô tick chọn đáp án đúng của câu trắc nghiệm: xanh có dấu ✓ khi là đáp án,
 * viền xám khi chưa chọn. Nằm trong `role="radiogroup"` — chỉ một đáp án đúng.
 */
function CorrectOptionToggle({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={`Chọn ${label} là đáp án đúng`}
      title={checked ? "Đáp án đúng" : `Chọn ${label} là đáp án đúng`}
      onClick={onSelect}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/50 ${
        checked
          ? "border-success bg-success text-text-inverse"
          : "border-border-default bg-bg-surface text-transparent hover:border-success hover:text-success/40"
      }`}
    >
      <Check className="size-5" strokeWidth={3} aria-hidden />
    </button>
  );
}
