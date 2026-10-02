"use client";

import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  fixedSalaryInputClassName,
  formatFixedSalaryVnd,
} from "@/lib/fixed-salary-settings.helpers";

function axisPreview(params: {
  input: string;
  roleDefault: number | null;
  formatApplied: (value: number) => string;
  zeroOverrideLabel: string;
}): { value: string; sourceLabel: string } {
  const trimmed = params.input.trim();
  if (trimmed === "") {
    if (params.roleDefault == null) {
      return { value: "chưa cấu hình", sourceLabel: "mặc định vai trò" };
    }
    return {
      value: params.formatApplied(params.roleDefault),
      sourceLabel: "mặc định vai trò",
    };
  }

  if (trimmed === "0") {
    return {
      value: params.formatApplied(0),
      sourceLabel: params.zeroOverrideLabel,
    };
  }

  return { value: trimmed, sourceLabel: "mức đè" };
}

export default function StaffRoleFixedSalaryFields({
  roleLabel,
  amountValue,
  rateValue,
  roleDefaultAmount,
  roleDefaultRate,
  onAmountChange,
  onRateChange,
}: {
  roleLabel: string;
  amountValue: string;
  rateValue: string;
  roleDefaultAmount: number | null;
  roleDefaultRate: number | null;
  onAmountChange: (value: string) => void;
  onRateChange: (value: string) => void;
}) {
  const amountPreview = axisPreview({
    input: amountValue,
    roleDefault: roleDefaultAmount,
    formatApplied: formatFixedSalaryVnd,
    zeroOverrideLabel: "cố ý loại",
  });
  const parsedRate =
    rateValue.trim() === "" ? null : Number(rateValue.replace(",", "."));
  const ratePreview = axisPreview({
    input: rateValue,
    roleDefault: roleDefaultRate,
    formatApplied: (value) => `${value}%`,
    zeroOverrideLabel: "cố ý 0%",
  });
  const rateDisplay =
    rateValue.trim() !== "" &&
    rateValue.trim() !== "0" &&
    parsedRate != null &&
    Number.isFinite(parsedRate)
      ? { value: `${parsedRate}%`, sourceLabel: "mức đè" }
      : ratePreview;

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="flex min-w-[10rem] flex-1 basis-[10rem] flex-col gap-1 text-sm text-text-secondary">
          <span>Lương cứng</span>
          <MoneyInput
            name={`staff-role-amount-${roleLabel}`}
            value={amountValue}
            onValueChange={onAmountChange}
            placeholder="Mặc định"
            aria-label={`Lương cứng ${roleLabel}`}
            className={fixedSalaryInputClassName}
          />
        </label>
        <label className="flex w-[6.75rem] min-w-[6.75rem] flex-none flex-col gap-1 text-sm text-text-secondary">
          <span>% vận hành</span>
          <input
            name={`staff-role-rate-${roleLabel}`}
            inputMode="decimal"
            value={rateValue}
            onChange={(event) => onRateChange(event.target.value)}
            placeholder="Mặc định"
            aria-label={`% vận hành ${roleLabel}`}
            className={fixedSalaryInputClassName}
          />
        </label>
      </div>
      <p className="text-xs leading-snug text-text-secondary">
        <span className="font-medium tabular-nums text-text-primary">
          {amountPreview.value}
        </span>
        <span className="text-text-muted"> ({amountPreview.sourceLabel})</span>
        <span aria-hidden="true" className="text-text-muted">
          {" · "}
        </span>
        <span className="font-medium tabular-nums text-text-primary">
          {rateDisplay.value}
        </span>
        <span className="text-text-muted"> ({rateDisplay.sourceLabel})</span>
      </p>
    </div>
  );
}
