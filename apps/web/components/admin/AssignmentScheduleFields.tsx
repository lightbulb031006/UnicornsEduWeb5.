"use client";

import { useId } from "react";
import { DateInput } from "@/components/ui/DateInput";
import { TimeInput } from "@/components/ui/TimeInput";
import {
  defaultAssignmentSchedule,
  fromOpenAtIso,
  toOpenAtIso,
} from "@/lib/assignment-schedule.helpers";

export { defaultAssignmentSchedule, fromOpenAtIso, toOpenAtIso };

const inputClass =
  "mt-1.5 w-full rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus font-medium";

export function AssignmentScheduleFields({
  openDate,
  openTime,
  durationMinutes,
  openAtOptional = false,
  onOpenDateChange,
  onOpenTimeChange,
}: {
  openDate: string;
  openTime: string;
  /** Thời lượng của tiết thực hành (chỉ đọc); null = chưa biết. */
  durationMinutes?: number | null;
  openAtOptional?: boolean;
  onOpenDateChange: (value: string) => void;
  onOpenTimeChange: (value: string) => void;
}) {
  const scheduleFieldId = useId();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-1">
        <label
          htmlFor={`${scheduleFieldId}-open-date`}
          className="text-xs font-semibold uppercase tracking-wider text-text-muted"
        >
          Ngày mở bài
          {openAtOptional ? null : <span className="text-error"> *</span>}
        </label>
        <DateInput
          id={`${scheduleFieldId}-open-date`}
          value={openDate}
          onChange={(event) => onOpenDateChange(event.target.value)}
          className={inputClass}
        />
        {openAtOptional ? (
          <p className="mt-1 text-xs text-text-muted">
            để trống = mở ngay khi thêm vào lớp
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-1">
        <label
          htmlFor={`${scheduleFieldId}-open-time`}
          className="text-xs font-semibold uppercase tracking-wider text-text-muted"
        >
          Giờ mở bài
          {openAtOptional ? null : <span className="text-error"> *</span>}
        </label>
        <TimeInput
          id={`${scheduleFieldId}-open-time`}
          value={openTime}
          onChange={(event) => onOpenTimeChange(event.target.value)}
          className={inputClass}
          prefillEmpty={!openAtOptional}
        />
        {openAtOptional ? (
          <p className="mt-1 text-xs text-text-muted">
            để trống = mở ngay khi thêm vào lớp
          </p>
        ) : null}
      </div>
      <p className="text-xs text-text-muted sm:col-span-2">
        Thời lượng làm bài
        {durationMinutes != null ? `: ${durationMinutes} phút/lượt` : null} —
        đặt trên tiết thực hành ở trang nội dung khoá.
      </p>
    </div>
  );
}
