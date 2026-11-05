"use client";

import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { ASSIGNMENT_DURATION_OPTIONS } from "@/lib/assignment-schedule.helpers";

/** Thời lượng làm bài (phút/lượt) của tiết thực hành cấp khoá. */
export function PracticeDurationField({
  value,
  onValueChange,
  disabled = false,
  hint,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  // Tiết cũ backfill từ lần giao có thể mang giá trị ngoài danh sách chọn sẵn.
  const options = ASSIGNMENT_DURATION_OPTIONS.some((o) => o.value === value)
    ? ASSIGNMENT_DURATION_OPTIONS
    : value
      ? [...ASSIGNMENT_DURATION_OPTIONS, { value, label: `${value} phút` }]
      : ASSIGNMENT_DURATION_OPTIONS;

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-text-muted">
        Thời lượng làm bài <span className="text-error">*</span>
      </span>
      <UpgradedSelect
        value={value}
        onValueChange={onValueChange}
        options={options}
        ariaLabel="Thời lượng làm bài"
        placeholder="Chọn thời lượng"
        disabled={disabled}
      />
      <p className="mt-1 text-xs text-text-muted">
        {hint ?? "Tính từ lúc học sinh bấm bắt đầu, áp cho mọi lớp được giao tiết này."}
      </p>
    </div>
  );
}
