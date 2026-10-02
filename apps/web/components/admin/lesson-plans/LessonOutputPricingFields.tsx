"use client";

import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { LessonOutputDifficultyBand } from "@/dtos/lesson.dto";
import {
  LESSON_OUTPUT_DIFFICULTY_BANDS,
  computeLessonOutputCost,
  formatLessonOutputDifficultyOption,
} from "@/lib/lesson-output-pricing";
import { moneyInputInitialFromNumber } from "@/lib/money-input.helpers";
import { formatVnNumber } from "@/lib/formatters";

const DIFFICULTY_OPTIONS = [
  { value: "", label: "Chưa chọn bậc" },
  ...LESSON_OUTPUT_DIFFICULTY_BANDS.map((band) => ({
    value: band,
    label: formatLessonOutputDifficultyOption(band),
  })),
];

function formatCurrency(value: number) {
  return formatVnNumber(value);
}

type Props = {
  compact?: boolean;
  difficultyBand: LessonOutputDifficultyBand | "";
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
  storedCost: number;
  selectButtonClassName: string;
  selectMenuClassName: string;
  onDifficultyBandChange: (value: LessonOutputDifficultyBand | "") => void;
  onIncludesTestChange: (value: boolean) => void;
  onIncludesSolutionChange: (value: boolean) => void;
  onIncludesLectureVideoChange: (value: boolean) => void;
};

export default function LessonOutputPricingFields({
  compact = false,
  difficultyBand,
  includesTest,
  includesSolution,
  includesLectureVideo,
  storedCost,
  selectButtonClassName,
  selectMenuClassName,
  onDifficultyBandChange,
  onIncludesTestChange,
  onIncludesSolutionChange,
  onIncludesLectureVideoChange,
}: Props) {
  const computedCost = computeLessonOutputCost(difficultyBand || null, {
    includesTest,
    includesSolution,
    includesLectureVideo,
  });
  const isLegacyRate = computedCost == null;
  const displayCost = isLegacyRate ? storedCost : computedCost;
  const labelClass = compact
    ? "text-sm text-text-secondary"
    : "text-sm text-text-secondary";
  const checkboxClass =
    "size-4 rounded border-border-default text-primary focus:ring-border-focus";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
      <label className={`flex flex-col gap-1.5 ${labelClass}`}>
        <span>Độ khó</span>
        <UpgradedSelect
          name="difficultyBand"
          value={difficultyBand}
          onValueChange={(value) =>
            onDifficultyBandChange((value ?? "") as LessonOutputDifficultyBand | "")
          }
          options={DIFFICULTY_OPTIONS}
          ariaLabel="Bậc độ khó giáo án"
          placeholder="Chọn bậc độ khó"
          buttonClassName={`${selectButtonClassName} flex items-center justify-between text-left`}
          menuClassName={selectMenuClassName}
        />
        <span className="text-xs text-text-muted">
          Gợi ý rating chỉ để chọn bậc; hệ thống không lưu số rating.
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Hạng mục đã làm</legend>
        <div className="flex flex-col gap-2 pt-1">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={includesTest}
              onChange={(event) => onIncludesTestChange(event.target.checked)}
              className={checkboxClass}
            />
            Sinh test
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={includesSolution}
              onChange={(event) => onIncludesSolutionChange(event.target.checked)}
              className={checkboxClass}
            />
            Lời giải
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={includesLectureVideo}
              onChange={(event) =>
                onIncludesLectureVideoChange(event.target.checked)
              }
              className={checkboxClass}
            />
            Bài giảng video
          </label>
        </div>
      </fieldset>

      <label className={`flex flex-col gap-1.5 sm:col-span-2 ${labelClass}`}>
        <span>Chi phí</span>
        <MoneyInput
          value={moneyInputInitialFromNumber(displayCost)}
          onValueChange={() => {
            /* Chi phí luôn read-only; backend là nguồn sự thật. */
          }}
          readOnly
          aria-readonly
          className="min-h-11 cursor-not-allowed rounded-xl border border-border-default bg-bg-secondary/55 px-3 py-2.5 text-text-muted shadow-sm focus:outline-none"
        />
        <span className="text-sm font-semibold text-text-primary">
          {formatCurrency(displayCost)} đ
        </span>
        <span className="text-xs text-text-muted">
          {isLegacyRate
            ? "Mức cũ — output chưa có bậc độ khó, số tiền đã lưu được giữ nguyên."
            : "Chi phí do hệ thống tính từ bậc và hạng mục đã tick; không sửa tay được."}
        </span>
      </label>
    </div>
  );
}
