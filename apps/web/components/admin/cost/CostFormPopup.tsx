"use client";

import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { COST_STATUS_OPTIONS } from "@/components/admin/cost/costStatusPresentation";
import { DateInput } from "@/components/ui/DateInput";
import { MoneyInput } from "@/components/ui/MoneyInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { CostBaseFields, CostStatus, CostUpsertMode } from "@/dtos/cost.dto";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";

export interface CostFormSubmitPayload {
  month?: string;
  category: string;
  amount: number;
  date?: string;
  status: CostStatus;
}

type Props = {
  open: boolean;
  mode: CostUpsertMode;
  onClose: () => void;
  initialData?: CostBaseFields | null;
  onSubmit: (payload: CostFormSubmitPayload) => Promise<void> | void;
  isSubmitting?: boolean;
};

function getPopupTitle(mode: CostUpsertMode): string {
  return mode === "create" ? "Thêm chi phí" : "Chỉnh sửa chi phí";
}

function getSubmitLabel(mode: CostUpsertMode, isSubmitting: boolean): string {
  if (isSubmitting) return "Đang lưu…";
  return mode === "create" ? "Tạo chi phí" : "Lưu thay đổi";
}

function getInitialCategory(initialData?: CostBaseFields | null): string {
  return initialData?.category?.trim() ?? "";
}

function getInitialMonth(initialData?: CostBaseFields | null): string {
  return initialData?.month?.trim() ?? "";
}

function getInitialDate(initialData?: CostBaseFields | null): string {
  return initialData?.date ? String(initialData.date).slice(0, 10) : "";
}

function getInitialStatus(initialData?: CostBaseFields | null): CostStatus {
  return initialData?.status ?? "pending";
}

function getInitialAmountInput(initialData?: CostBaseFields | null): string {
  return moneyInputInitialFromNumber(initialData?.amount ?? null);
}

export default function CostFormPopup({
  open,
  mode,
  onClose,
  initialData,
  onSubmit,
  isSubmitting = false,
}: Props) {
  const [category, setCategory] = useState(() => getInitialCategory(initialData));
  const [month, setMonth] = useState(() => getInitialMonth(initialData));
  const [date, setDate] = useState(() => getInitialDate(initialData));
  const [status, setStatus] = useState<CostStatus>(() => getInitialStatus(initialData));
  const [amountInput, setAmountInput] = useState(() => getInitialAmountInput(initialData));

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      toast.error("Danh mục là bắt buộc.");
      return;
    }

    const trimmedAmount = amountInput.trim();
    const parsedAmount = parseMoneyInput(trimmedAmount);
    if (!trimmedAmount || parsedAmount == null || parsedAmount < 0) {
      toast.error("Số tiền phải là số hợp lệ và lớn hơn hoặc bằng 0.");
      return;
    }

    const trimmedDate = date.trim();
    if (trimmedDate) {
      const parsedDate = new Date(trimmedDate);
      if (Number.isNaN(parsedDate.getTime())) {
        toast.error("Ngày không hợp lệ.");
        return;
      }
    }

    await onSubmit({
      category: trimmedCategory,
      month: month.trim() || undefined,
      date: trimmedDate || undefined,
      status,
      amount: parsedAmount,
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cost-form-popup-title"
        className="fixed inset-x-3 top-1/2 z-50 max-h-[88vh] -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-xl sm:left-1/2 sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="cost-form-popup-title" className="text-lg font-semibold text-text-primary">
            {getPopupTitle(mode)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>Danh mục</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ví dụ: Marketing"
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Tháng</span>
              <input
                type="text"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="Ví dụ: 2026-03"
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Ngày</span>
              <DateInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Trạng thái</span>
              <UpgradedSelect
                name="cost-status"
                value={status}
                onValueChange={(nextValue) => setStatus(nextValue as CostStatus)}
                options={COST_STATUS_OPTIONS}
                buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Số tiền</span>
              <MoneyInput
                value={amountInput}
                onValueChange={setAmountInput}
                placeholder="Ví dụ: 500.000"
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              {getSubmitLabel(mode, isSubmitting)}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
