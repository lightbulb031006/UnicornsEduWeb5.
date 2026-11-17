"use client";

import { useState } from "react";
import MonthNav from "@/components/admin/MonthNav";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { StudentDemographicsPeriodType } from "@/dtos/dashboard.dto";
import { buildMonthKey, buildYearOptions, parseMonthKey } from "@/lib/month-format";
import { SegmentedToggle } from "./StudentDemographicsContent";

export interface StudentDemographicsPeriodValue {
  type: StudentDemographicsPeriodType;
  /** YYYY, bắt buộc khi type ≠ "all". */
  year?: string;
  /** 01-12, chỉ khi type = "month". */
  month?: string;
}

const PERIOD_OPTIONS: ReadonlyArray<{ key: StudentDemographicsPeriodType; label: string }> = [
  { key: "all", label: "Toàn thời gian" },
  { key: "month", label: "Theo tháng" },
  { key: "year", label: "Theo năm" },
];

/** Bộ lọc kỳ: Toàn thời gian / Theo tháng (MonthNav) / Theo năm (chọn năm). Render 2 ô cho grid 3 cột của cha. */
export function StudentDemographicsPeriodFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: StudentDemographicsPeriodValue;
  onChange: (value: StudentDemographicsPeriodValue) => void;
  disabled?: boolean;
}) {
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const now = new Date();
  const year = value.year ?? String(now.getFullYear());
  const month = value.month ?? String(now.getMonth() + 1).padStart(2, "0");
  const yearNum = Number(year);
  const yearOptions = buildYearOptions({ startYear: Math.min(2020, yearNum), endYear: Math.max(now.getFullYear(), yearNum) });

  const handleTypeChange = (type: StudentDemographicsPeriodType) => {
    if (type === "all") onChange({ type });
    else if (type === "year") onChange({ type, year });
    else onChange({ type, year, month });
  };

  return (
    // `contents`: toggle kỳ và ô chọn tháng/năm thành con trực tiếp của grid cha → ô chọn nằm cột giữa.
    <div className="contents">
      <div className="justify-self-start">
        <SegmentedToggle ariaLabel="Kỳ thống kê" value={value.type} onChange={handleTypeChange} options={PERIOD_OPTIONS} />
      </div>
      {/* Luôn render cột giữa (kể cả "Toàn thời gian") để nhóm trạng thái không trượt vào giữa. */}
      <div className="flex justify-center">
        {value.type === "month" ? (
          <MonthNav
            value={buildMonthKey(yearNum, Number(month))}
            onChange={(key) => {
              const parsed = parseMonthKey(key);
              if (!parsed) return;
              onChange({ type: "month", year: String(parsed.year), month: String(parsed.month).padStart(2, "0") });
            }}
            monthPopupOpen={monthPopupOpen}
            setMonthPopupOpen={setMonthPopupOpen}
            disabled={disabled}
          />
        ) : null}
        {value.type === "year" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ type: "year", year: String(yearNum - 1) })}
              disabled={disabled}
              aria-label="Năm trước"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border-default text-text-secondary transition hover:bg-bg-secondary disabled:opacity-50"
            >
              ‹
            </button>
            <div className="w-28">
              <UpgradedSelect
                value={year}
                onValueChange={(y) => onChange({ type: "year", year: y })}
                options={yearOptions.map((o) => ({ ...o, label: `Năm ${o.label}` }))}
                ariaLabel="Chọn năm"
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ type: "year", year: String(yearNum + 1) })}
              disabled={disabled || yearNum >= now.getFullYear()}
              aria-label="Năm sau"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border-default text-text-secondary transition hover:bg-bg-secondary disabled:opacity-50"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
