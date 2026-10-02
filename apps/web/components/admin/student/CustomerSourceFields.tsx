"use client";

import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  STUDENT_CUSTOMER_SOURCE_OPTIONS,
  type StudentCustomerSource,
} from "@/dtos/student.dto";

const fieldClassName =
  "min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-tertiary disabled:text-text-muted";

export function CustomerSourceFields({
  source,
  note,
  onSourceChange,
  onNoteChange,
  disabled = false,
  idPrefix,
  emptyLabel = "Chọn nguồn khách",
}: {
  source: StudentCustomerSource | "";
  note: string;
  onSourceChange: (value: StudentCustomerSource) => void;
  onNoteChange: (value: string) => void;
  disabled?: boolean;
  idPrefix: string;
  emptyLabel?: string;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
        <span className="mb-0.5">Nguồn khách</span>
        <UpgradedSelect
          name={`${idPrefix}-customer-source`}
          value={source}
          onValueChange={(nextValue) => onSourceChange(nextValue as StudentCustomerSource)}
          options={STUDENT_CUSTOMER_SOURCE_OPTIONS}
          placeholder={source ? "Chọn nguồn khách" : emptyLabel}
          disabled={disabled}
          buttonClassName={fieldClassName}
          menuClassName="rounded-2xl border border-border-default bg-bg-surface p-1.5 shadow-2xl"
        />
      </label>
      {source === "other" ? (
        <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
          <span>Chú thích nguồn</span>
          <input
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            disabled={disabled}
            maxLength={200}
            required
            placeholder="Ghi nguồn thực tế"
            className={fieldClassName}
          />
        </label>
      ) : null}
    </>
  );
}
