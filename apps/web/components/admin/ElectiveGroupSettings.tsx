"use client";

import { useState } from "react";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { QuestionSlotDto } from "@/dtos/attempt.dto";
import type { UpdateCourseLessonPayload } from "@/dtos/course-content.dto";

export const QUESTION_SLOT_OPTIONS: { value: QuestionSlotDto; label: string }[] =
  [
    { value: "required", label: "Bắt buộc" },
    { value: "elective_1", label: "Tự chọn 1" },
    { value: "elective_2", label: "Tự chọn 2" },
  ];

/** Chọn vị trí của câu trong đề IT (Bắt buộc / Tự chọn 1 / Tự chọn 2). */
export function QuestionSlotSelect({
  value,
  disabled,
  onChange,
}: {
  value: QuestionSlotDto;
  disabled?: boolean;
  onChange: (slot: QuestionSlotDto) => void;
}) {
  return (
    <div className="w-32">
      <UpgradedSelect
        value={value}
        onValueChange={(v) => onChange(v as QuestionSlotDto)}
        options={QUESTION_SLOT_OPTIONS}
        ariaLabel="Vị trí câu trong đề"
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Tên hai nhóm tự chọn (vd "Khoa học máy tính" / "Tin học ứng dụng") + cảnh báo
 * form đề. Lưu khi rời ô nhập.
 */
export function ElectiveGroupSettings({
  elective1Name,
  elective2Name,
  formWarning,
  canEdit,
  onSave,
}: {
  elective1Name: string | null | undefined;
  elective2Name: string | null | undefined;
  formWarning: string | null | undefined;
  canEdit: boolean;
  onSave: (
    patch: Pick<UpdateCourseLessonPayload, "elective1Name" | "elective2Name">,
  ) => void;
}) {
  const [names, setNames] = useState({
    elective1Name: elective1Name ?? "",
    elective2Name: elective2Name ?? "",
  });

  const commit = (key: "elective1Name" | "elective2Name") => {
    const next = names[key].trim();
    const saved = (key === "elective1Name" ? elective1Name : elective2Name) ?? "";
    if (next === saved) return;
    onSave({ [key]: next || null });
  };

  return (
    <div className="space-y-2">
      {formWarning ? (
        <p
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text-primary"
        >
          {formWarning}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            ["elective1Name", "Tên nhóm Tự chọn 1"],
            ["elective2Name", "Tên nhóm Tự chọn 2"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs font-medium text-text-muted">
              {label}
            </span>
            <input
              className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
              value={names[key]}
              maxLength={120}
              disabled={!canEdit}
              placeholder={
                key === "elective1Name" ? "Khoa học máy tính" : "Tin học ứng dụng"
              }
              onChange={(e) =>
                setNames((prev) => ({ ...prev, [key]: e.target.value }))
              }
              onBlur={() => commit(key)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
