"use client";

import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import type { ClassPricingMode } from "@/dtos/class.dto";
import {
  CLASS_PRICING_MODE_CHANGE_CONFIRM,
  formatStandardBlockSummary,
  requestClassPricingModeChange,
} from "@/lib/class-pricing-mode";

type Props = {
  value: ClassPricingMode;
  onChange: (next: ClassPricingMode) => void;
  disabled?: boolean;
  standardBlockCount: number | null;
  missingReason: string;
  requireConfirm?: boolean;
  previewLines?: string[];
};

export default function ClassPricingModeField({
  value,
  onChange,
  disabled = false,
  standardBlockCount,
  missingReason,
  requireConfirm = false,
  previewLines = [],
}: Props) {
  const checked = value === "per_block";

  const handleCheckedChange = (nextChecked: boolean) => {
    const next: ClassPricingMode = nextChecked ? "per_block" : "per_session";
    const result = requestClassPricingModeChange({
      current: value,
      next,
      standardBlockCount,
      missingReason,
      requireConfirm,
      confirm: () => window.confirm(CLASS_PRICING_MODE_CHANGE_CONFIRM),
    });
    if (!result.ok) {
      if (next === "per_block" && (standardBlockCount == null || standardBlockCount <= 0)) {
        toast.error(result.reason);
      }
      return;
    }
    onChange(result.next);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">Chế độ tính tiền</p>
          <p className="text-xs text-text-muted">
            Mặc định theo buổi. Bật block 30 phút khi mọi khung giờ có thời lượng là bội số 30
            phút — các khung giờ không cần dài bằng nhau.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
          <Switch
            checked={checked}
            disabled={disabled}
            aria-label="Tính tiền theo block 30 phút"
            onCheckedChange={handleCheckedChange}
          />
          <span className="whitespace-nowrap">{checked ? "Theo block 30 phút" : "Theo buổi"}</span>
        </label>
      </div>

      {checked && standardBlockCount != null ? (
        <Alert variant="info" className="rounded-lg px-3 py-2">
          <AlertTitle className="text-sm">{formatStandardBlockSummary(standardBlockCount)}</AlertTitle>
          {previewLines.length > 0 ? (
            <AlertDescription className="space-y-1 text-xs text-text-secondary">
              {previewLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      {!checked && (standardBlockCount == null || standardBlockCount <= 0) ? (
        <p className="text-xs text-text-muted">{missingReason}</p>
      ) : null}
    </div>
  );
}
