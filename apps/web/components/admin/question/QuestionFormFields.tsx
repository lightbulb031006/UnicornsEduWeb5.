"use client";

import type { ReactNode } from "react";

import MathRichTextEditor from "@/components/ui/MathRichTextEditor";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { QuestionTypeDto } from "@/dtos/question.dto";
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
  explanation: string;
  answerGuide: string;
};

export const emptyQuestionFormValue: QuestionFormValue = {
  moduleId: "",
  difficultyLevelId: "",
  type: QuestionTypeDto.single_choice,
  content: "",
  options: ["", ""],
  correctIndex: 0,
  explanation: "",
  answerGuide: "",
};

const TYPE_OPTIONS = [
  { value: QuestionTypeDto.single_choice, label: "Trắc nghiệm" },
  { value: QuestionTypeDto.essay, label: "Tự luận" },
];

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
}: {
  courseId: string;
  value: QuestionFormValue;
  onChange: (patch: Partial<QuestionFormValue>) => void;
  courseSlot?: ReactNode;
}) {
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
    if (value.options.length < 6) onChange({ options: [...value.options, ""] });
  };

  const removeOption = (index: number) => {
    if (value.options.length <= 2) return;
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
            disabled={!courseId}
            ariaLabel="Chuyên đề"
            {...chapterCreate}
          />
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

      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Loại câu hỏi
        </span>
        <UpgradedSelect
          value={value.type}
          onValueChange={(v) => onChange({ type: v as QuestionTypeDto })}
          options={TYPE_OPTIONS}
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
          placeholder="Nhập nội dung câu hỏi..."
          minHeight="min-h-[120px]"
        />
      </div>

      {value.type === QuestionTypeDto.single_choice && (
        <div className="space-y-2">
          <span className="mb-1 block text-xs font-medium text-text-muted">
            Phương án ({value.options.length}/6)
          </span>
          {value.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-center text-sm font-bold text-text-muted">
                {String.fromCharCode(65 + i)}
              </span>
              <input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                className="flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label={`Phương án ${String.fromCharCode(65 + i)}`}
                placeholder={`Phương án ${String.fromCharCode(65 + i)}`}
              />
              <input
                type="radio"
                name="correctIndex"
                checked={value.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                className="accent-primary"
                title="Đáp án đúng"
              />
              {value.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-error hover:text-error/80"
                  aria-label={`Xoá phương án ${String.fromCharCode(65 + i)}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {value.options.length < 6 && (
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

      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">
          Giải thích (tuỳ chọn)
        </span>
        <MathRichTextEditor
          value={value.explanation}
          onChange={(next) => onChange({ explanation: next })}
          ariaLabel="Giải thích"
          placeholder="Giải thích đáp án..."
          minHeight="min-h-[80px]"
        />
      </div>

      {value.type === QuestionTypeDto.essay && (
        <div>
          <span className="mb-1 block text-xs font-medium text-text-muted">
            Hướng dẫn trả lời (tuỳ chọn)
          </span>
          <MathRichTextEditor
            value={value.answerGuide}
            onChange={(next) => onChange({ answerGuide: next })}
            ariaLabel="Hướng dẫn trả lời"
            placeholder="Hướng dẫn cho câu tự luận..."
            minHeight="min-h-[80px]"
          />
        </div>
      )}
    </div>
  );
}
