"use client";

import { useId } from "react";
import { DateInput } from "@/components/ui/DateInput";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  AssignmentCloseAtDraft,
  AssignmentCloseAtMode,
} from "@/dtos/class-content.dto";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus font-medium";

const MODE_LABELS: Record<AssignmentCloseAtMode, string> = {
  class: "Theo hạn xem nội dung của lớp",
  custom: "Tự chọn ngày giờ",
  none: "Không có hạn",
};

/**
 * Hạn làm bài của lần giao: từ hạn không bắt đầu lượt mới.
 * `allowClassDefault` chỉ bật khi giao mới (server lấy hạn xem nội dung của lớp).
 */
export function AssignmentCloseAtField({
  value,
  onChange,
  allowClassDefault = false,
}: {
  value: AssignmentCloseAtDraft;
  onChange: (value: AssignmentCloseAtDraft) => void;
  allowClassDefault?: boolean;
}) {
  const fieldId = useId();
  const modes: AssignmentCloseAtMode[] = allowClassDefault
    ? ["class", "custom", "none"]
    : ["custom", "none"];

  return (
    <div className="space-y-3">
      <div>
        <p
          id={`${fieldId}-mode`}
          className="text-xs font-semibold uppercase tracking-wider text-text-muted"
        >
          Hạn làm bài
        </p>
        <div className="mt-1.5">
          <UpgradedSelect
            labelId={`${fieldId}-mode`}
            value={value.mode}
            onValueChange={(mode) =>
              onChange({ ...value, mode: mode as AssignmentCloseAtMode })
            }
            options={modes.map((mode) => ({
              value: mode,
              label: MODE_LABELS[mode],
            }))}
          />
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Sau hạn học sinh không bắt đầu lượt mới; điểm và đáp án hiện ngay khi
          nộp.
        </p>
      </div>
      {value.mode === "custom" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${fieldId}-date`}
              className="text-xs font-semibold uppercase tracking-wider text-text-muted"
            >
              Ngày hết hạn<span className="text-error"> *</span>
            </label>
            <DateInput
              id={`${fieldId}-date`}
              value={value.date}
              onChange={(event) =>
                onChange({ ...value, date: event.target.value })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor={`${fieldId}-time`}
              className="text-xs font-semibold uppercase tracking-wider text-text-muted"
            >
              Giờ hết hạn<span className="text-error"> *</span>
            </label>
            <TimeInput
              id={`${fieldId}-time`}
              value={value.time}
              onChange={(event) =>
                onChange({ ...value, time: event.target.value })
              }
              className={inputClass}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
