"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  confirmUnsavedClose,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import {
  parseTrainingManagerRatePercent,
  toTrainingManagerRateDraft,
} from "@/lib/training-manager-rate";

type Props = {
  title: string;
  description?: ReactNode;
  initialRatePercent: number;
  isPending: boolean;
  onSubmit: (ratePercent: number) => void;
  onClose: () => void;
};

export default function TrainingManagerRateDialog({
  title,
  description,
  initialRatePercent,
  isPending,
  onSubmit,
  onClose,
}: Props) {
  const initialDraft = toTrainingManagerRateDraft(initialRatePercent);
  const [draft, setDraft] = useState(initialDraft);
  const { confirm, dialog } = useConfirmDialog();

  const parsed = parseTrainingManagerRatePercent(draft);
  const isDirty = draft.trim() !== initialDraft;
  const canSubmit = parsed !== null && parsed !== initialRatePercent;

  const requestClose = async () => {
    if (isPending) return;
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isPending || parsed === null) return;
    onSubmit(parsed);
  };

  return (
    <>
      <ResponsiveDialog
        size="sm"
        labelledBy="training-manager-rate-title"
        describedBy={description ? "training-manager-rate-desc" : undefined}
        onBackdropClick={() => void requestClose()}
      >
        <div className="border-b border-border-default px-4 py-3 sm:px-5">
          <h2
            id="training-manager-rate-title"
            className="text-base font-semibold text-text-primary"
          >
            {title}
          </h2>
          {description ? (
            <div
              id="training-manager-rate-desc"
              className="mt-1 text-sm text-text-secondary"
            >
              {description}
            </div>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <ResponsiveDialogBody>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-secondary">
                % quản lý lớp
              </span>
              <div className="relative">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={parsed === null}
                  className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2 pr-9 text-base tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:text-sm"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-muted">
                  %
                </span>
              </div>
              {parsed === null ? (
                <span className="mt-1.5 block text-xs text-error">
                  Nhập số lớn hơn 0 và không quá 100 (tối đa 2 chữ số thập
                  phân).
                </span>
              ) : null}
            </label>
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={isPending}
              className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
