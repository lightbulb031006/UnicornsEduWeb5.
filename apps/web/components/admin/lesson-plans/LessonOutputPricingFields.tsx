"use client";

import type { ReactNode } from "react";
import UpgradedSelect, {
  type UpgradedSelectOption,
} from "@/components/ui/UpgradedSelect";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { LessonOutputDifficultyBand } from "@/dtos/lesson.dto";
import {
  LESSON_OUTPUT_DIFFICULTY_BANDS,
  LESSON_OUTPUT_THEORY_LECTURE_MAX_LINKS,
  LESSON_OUTPUT_THEORY_LECTURE_PRICES,
  computeLessonOutputCost,
  formatLessonOutputDifficultyOption,
  getLessonOutputFieldVisibility,
  parseLessonOutputLevel,
} from "@/lib/lesson-output-pricing";
import LessonOutputLinkListField from "./LessonOutputLinkListField";
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

type PricingItemCheckboxProps = {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
};

/** Ô tick dạng thẻ: vùng bấm lớn (≥44px) cho mobile, highlight khi đã chọn. */
function PricingItemCheckbox({
  checked,
  disabled,
  onChange,
  children,
}: PricingItemCheckboxProps) {
  return (
    <label
      className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-border-focus ${
        checked
          ? "border-primary/40 bg-primary/8 text-text-primary"
          : "border-border-default bg-bg-surface text-text-primary hover:bg-bg-secondary"
      } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="size-4 shrink-0 rounded border-border-default text-primary focus:ring-border-focus"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

type Props = {
  compact?: boolean;
  difficultyBand: LessonOutputDifficultyBand | "";
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
  includesTheoryLecture: boolean;
  theoryLectureLinks: string[];
  /** `level` của output — nguồn giá Bài giảng lý thuyết. */
  level: string;
  levelOptions: UpgradedSelectOption[];
  storedCost: number;
  /**
   * `true` = chỉ xem bậc độ khó / level / hạng mục. Tự khai chi phí giáo án: người nhận
   * thanh toán, Trưởng ban Chuyên môn và Admin cài khi output chưa thanh toán.
   * Khi khoá thì không gate field theo hạng mục (hiện hết).
   */
  pricingLocked?: boolean;
  /** Lý do khoá hiển thị dưới «Hạng mục đã làm». */
  pricingLockedMessage?: string;
  selectButtonClassName: string;
  selectMenuClassName: string;
  linkInputClassName: string;
  onDifficultyBandChange: (value: LessonOutputDifficultyBand | "") => void;
  onLevelChange: (value: string) => void;
  onIncludesTestChange: (value: boolean) => void;
  onIncludesSolutionChange: (value: boolean) => void;
  onIncludesLectureVideoChange: (value: boolean) => void;
  onIncludesTheoryLectureChange: (value: boolean) => void;
  onTheoryLectureLinksChange: (links: string[]) => void;
};

/**
 * Khối giá của lesson output, luôn đặt đầu form:
 * Hạng mục đã làm → (lý thuyết) Level + link video → (bài tập) Độ khó → Chi phí.
 */
export default function LessonOutputPricingFields({
  compact = false,
  difficultyBand,
  includesTest,
  includesSolution,
  includesLectureVideo,
  includesTheoryLecture,
  theoryLectureLinks,
  level,
  levelOptions,
  storedCost,
  pricingLocked = false,
  pricingLockedMessage = "Chỉ người nhận thanh toán output, Trưởng ban Chuyên môn và Admin cài bậc độ khó, level và hạng mục.",
  selectButtonClassName,
  selectMenuClassName,
  linkInputClassName,
  onDifficultyBandChange,
  onLevelChange,
  onIncludesTestChange,
  onIncludesSolutionChange,
  onIncludesLectureVideoChange,
  onIncludesTheoryLectureChange,
  onTheoryLectureLinksChange,
}: Props) {
  const items = {
    includesTest,
    includesSolution,
    includesLectureVideo,
    includesTheoryLecture,
  };
  const { hasAnyItem, showProblemFields, showTheoryFields } =
    getLessonOutputFieldVisibility(items, pricingLocked);
  const computedCost = computeLessonOutputCost(
    difficultyBand || null,
    items,
    level,
  );
  const parsedLevel = parseLessonOutputLevel(level);
  const theoryLectureHint =
    parsedLevel == null
      ? "giá theo level"
      : `${formatCurrency(LESSON_OUTPUT_THEORY_LECTURE_PRICES[parsedLevel])} đ · Level ${parsedLevel}`;
  const isLegacyRate = computedCost == null;
  const displayCost = isLegacyRate ? storedCost : computedCost;
  const showCost = hasAnyItem || pricingLocked || storedCost > 0;
  const labelClass = "text-sm text-text-secondary";
  const fieldGap = compact ? "gap-1.5" : "gap-1";

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className={`${labelClass} mb-2 font-medium`}>
          Hạng mục đã làm
        </legend>
        {pricingLocked ? (
          <p className="text-xs text-text-muted">{pricingLockedMessage}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <PricingItemCheckbox
            checked={includesTest}
            disabled={pricingLocked}
            onChange={onIncludesTestChange}
          >
            Sinh test
          </PricingItemCheckbox>
          <PricingItemCheckbox
            checked={includesSolution}
            disabled={pricingLocked}
            onChange={onIncludesSolutionChange}
          >
            Lời giải
          </PricingItemCheckbox>
          <PricingItemCheckbox
            checked={includesLectureVideo}
            disabled={pricingLocked}
            onChange={onIncludesLectureVideoChange}
          >
            Bài giảng video
          </PricingItemCheckbox>
          <PricingItemCheckbox
            checked={includesTheoryLecture}
            disabled={pricingLocked}
            onChange={onIncludesTheoryLectureChange}
          >
            Bài giảng lý thuyết
            <span className="ml-1 text-xs text-text-muted">
              ({theoryLectureHint})
            </span>
          </PricingItemCheckbox>
        </div>
        {!hasAnyItem && !pricingLocked ? (
          <p className="text-xs text-text-muted">
            Tick hạng mục để mở các trường tương ứng: Sinh test / Lời giải /
            Bài giảng video mở thông tin bài tập; Bài giảng lý thuyết mở Level
            và link video.
          </p>
        ) : null}
      </fieldset>

      {showTheoryFields || showProblemFields ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
          {showTheoryFields ? (
            <div className={`flex flex-col ${fieldGap} ${labelClass}`}>
              <span>Level</span>
              <UpgradedSelect
                name="level"
                value={level}
                onValueChange={(value) => onLevelChange((value ?? "").trim())}
                options={levelOptions}
                ariaLabel="Level lesson output"
                placeholder="Chọn level"
                disabled={pricingLocked}
                buttonClassName={`${selectButtonClassName} flex items-center justify-between text-left`}
                menuClassName={selectMenuClassName}
              />
              <span className="text-xs text-text-muted">
                Bài giảng lý thuyết tính tiền theo Level 0–5.
              </span>
            </div>
          ) : null}

          {showProblemFields ? (
            <div className={`flex flex-col ${fieldGap} ${labelClass}`}>
              <span>Độ khó</span>
              <UpgradedSelect
                name="difficultyBand"
                value={difficultyBand}
                onValueChange={(value) =>
                  onDifficultyBandChange(
                    (value ?? "") as LessonOutputDifficultyBand | "",
                  )
                }
                options={DIFFICULTY_OPTIONS}
                ariaLabel="Bậc độ khó giáo án"
                placeholder="Chọn bậc độ khó"
                disabled={pricingLocked}
                buttonClassName={`${selectButtonClassName} flex items-center justify-between text-left`}
                menuClassName={selectMenuClassName}
              />
              <span className="text-xs text-text-muted">
                Gợi ý rating chỉ để chọn bậc; hệ thống không lưu số rating.
              </span>
            </div>
          ) : null}

          {showTheoryFields ? (
            <div className="sm:col-span-2">
              <LessonOutputLinkListField
                label="Link bài giảng lý thuyết"
                links={theoryLectureLinks}
                maxLinks={LESSON_OUTPUT_THEORY_LECTURE_MAX_LINKS}
                inputClassName={linkInputClassName}
                onChange={onTheoryLectureLinksChange}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showCost ? (
        <label className={`flex flex-col ${fieldGap} ${labelClass}`}>
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
              : "Chi phí do hệ thống tính từ bậc, level và hạng mục đã tick; không sửa tay được."}
          </span>
        </label>
      ) : null}
    </div>
  );
}
