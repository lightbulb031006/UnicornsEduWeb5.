"use client";

import Image from "next/image";
import { useMemo, useState, type SyntheticEvent } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { StudentSePayStaticQrResponse } from "@/dtos/student.dto";
import * as studentApi from "@/lib/apis/student.api";
import { copyStudentWalletQrWithToast } from "@/lib/clipboard-qr";
import { formatCurrency } from "@/lib/class.helpers";
import { parseMoneyInput } from "@/lib/money-input.helpers";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { MoneyInput } from "@/components/ui/MoneyInput";

type BalanceMode = "topup" | "withdraw";
type TopUpMethod = "sepay" | "direct";

type BalanceSubject = {
  id: string;
  fullName?: string | null;
  accountBalance?: number | null;
};

type BalanceModeCopy = {
  eyebrow: string;
  title: string;
  description: string;
  submitLabel: string;
  deltaPrefix: string;
  chipClass: string;
  chipLabel: string;
};

type Props = {
  open: boolean;
  mode: BalanceMode;
  onClose: () => void;
  student: BalanceSubject;
  onSuccess?: () => void | Promise<void>;
  submitBalanceChange?: (amount: number, reason?: string) => Promise<unknown>;
  invalidateQueryKeys?: QueryKey[];
  allowNegativeBalance?: boolean;
  directBalanceChangeEnabled?: boolean;
  directReasonRequired?: boolean;
  defaultTopUpMethod?: TopUpMethod;
  showTopUpMethodTabs?: boolean;
  copyOverrides?: Partial<Record<BalanceMode, Partial<BalanceModeCopy>>>;
  successTargetLabel?: string;
  directBalanceChangeLoadingMessage?: string;
  directBalanceChangeSuccessMessage?: string;
  directReasonLabel?: string;
  directReasonPlaceholder?: string;
  errorMessages?: Partial<Record<BalanceMode, string>>;
  blockedNegativeBalanceMessage?: string;
  /**
   * Khi có, nạp tiền hiển thị QR SePay tĩnh riêng của học sinh (không tạo đơn, không nhập số tiền).
   */
  sePayStaticQr?: StudentSePayStaticQrResponse | null;
  isSePayStaticQrLoading?: boolean;
  sePayStaticQrErrorMessage?: string | null;
};

const MODE_COPY: Record<BalanceMode, BalanceModeCopy> = {
  topup: {
    eyebrow: "Top Up",
    title: "Nạp tiền vào tài khoản",
    description:
      "Quét QR SePay tĩnh hoặc nạp thẳng nếu bạn có quyền admin.",
    submitLabel: "Xác nhận thay đổi số dư",
    deltaPrefix: "+",
    chipClass: "bg-primary/10 text-primary ring-primary/20",
    chipLabel: "Cộng vào số dư",
  },
  withdraw: {
    eyebrow: "Withdraw",
    title: "Rút tiền khỏi tài khoản",
    description: "Số tiền nhập vào sẽ được trừ trực tiếp khỏi số dư hiện tại của học sinh.",
    submitLabel: "Xác nhận rút tiền",
    deltaPrefix: "-",
    chipClass: "bg-warning/15 text-text-primary ring-warning/20",
    chipLabel: "Trừ khỏi số dư",
  },
};

function balanceClassName(value: number): string {
  return value < 0 ? "text-error" : "text-text-primary";
}

export default function StudentBalancePopup({
  open,
  mode,
  onClose,
  student,
  onSuccess,
  submitBalanceChange,
  invalidateQueryKeys,
  allowNegativeBalance = true,
  directBalanceChangeEnabled = true,
  directReasonRequired = false,
  defaultTopUpMethod,
  showTopUpMethodTabs = false,
  copyOverrides,
  successTargetLabel,
  directBalanceChangeLoadingMessage,
  directBalanceChangeSuccessMessage,
  directReasonLabel = "Lý do chỉnh số dư",
  directReasonPlaceholder = "Ví dụ: Phụ huynh chuyển khoản ngoài SePay",
  errorMessages,
  blockedNegativeBalanceMessage = "Số dư hiện tại không đủ để rút số tiền này.",
  sePayStaticQr,
  isSePayStaticQrLoading = false,
  sePayStaticQrErrorMessage,
}: Props) {
  const queryClient = useQueryClient();
  const hasSePayStaticQrSource =
    sePayStaticQr !== undefined ||
    isSePayStaticQrLoading ||
    Boolean(sePayStaticQrErrorMessage);
  const preferredTopUpMethod =
    defaultTopUpMethod ?? (hasSePayStaticQrSource ? "sepay" : "direct");
  const [amountInput, setAmountInput] = useState("");
  const [topUpMethod, setTopUpMethod] = useState<TopUpMethod>(preferredTopUpMethod);
  const [reasonInput, setReasonInput] = useState("");
  const [isCopyingQr, setIsCopyingQr] = useState(false);

  const sePayTopupEnabled =
    mode === "topup" && topUpMethod === "sepay" && hasSePayStaticQrSource;
  const directTopupSelected = mode === "topup" && topUpMethod === "direct";
  const directBalanceChangeSelected = mode === "withdraw" || directTopupSelected;

  const currentBalance = student.accountBalance ?? 0;
  const rawAmount = parseMoneyInput(amountInput.trim());
  const positiveAmount =
    rawAmount != null && rawAmount > 0 ? rawAmount : 0;
  const withdrawAmount = positiveAmount;
  const signedTopUpAmount = positiveAmount;
  const hasValidAmount = positiveAmount > 0;
  const deltaAmount = directBalanceChangeSelected
    ? mode === "topup"
      ? signedTopUpAmount
      : -withdrawAmount
    : 0;
  const directReason = reasonInput.trim();
  const nextBalance = currentBalance + deltaAmount;
  const modeCopy = {
    ...MODE_COPY[mode],
    ...Object.fromEntries(
      Object.entries(copyOverrides?.[mode] ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  } as BalanceModeCopy;
  const studentName = student.fullName?.trim() || "Học sinh";
  const queryKeysToInvalidate = invalidateQueryKeys ?? [
    ["student", "detail", student.id],
    ["student", "list"],
    ["student", "wallet-history", student.id],
  ];

  const impactDisplay = sePayTopupEnabled
    ? "Theo số tiền chuyển"
    : !hasValidAmount
    ? "Nhập số tiền"
    : `${deltaAmount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(deltaAmount))}`;

  const impactClassName = sePayTopupEnabled
    ? "text-primary"
    : !hasValidAmount
    ? "text-text-muted"
    : mode === "withdraw" || deltaAmount < 0
      ? "text-warning"
      : "text-primary";

  const impactChip = useMemo(() => {
    if (mode === "withdraw") {
      return { chipClass: MODE_COPY.withdraw.chipClass, chipLabel: MODE_COPY.withdraw.chipLabel };
    }
    if (sePayTopupEnabled) {
      return { chipClass: MODE_COPY.topup.chipClass, chipLabel: "Webhook tự cộng ví" };
    }
    if (!hasValidAmount) {
      return { chipClass: MODE_COPY.topup.chipClass, chipLabel: MODE_COPY.topup.chipLabel };
    }
    if (deltaAmount < 0) {
      return { chipClass: MODE_COPY.withdraw.chipClass, chipLabel: "Trừ khỏi số dư" };
    }
    return { chipClass: MODE_COPY.topup.chipClass, chipLabel: MODE_COPY.topup.chipLabel };
  }, [mode, sePayTopupEnabled, hasValidAmount, deltaAmount]);

  const summaryItems = useMemo(
    () => [
      {
        label: "Hiện tại",
        value: formatCurrency(currentBalance),
        className: balanceClassName(currentBalance),
      },
      {
        label: "Tác động",
        value: impactDisplay,
        className: impactClassName,
      },
      {
        label: "Sau giao dịch",
        value: formatCurrency(nextBalance),
        className: balanceClassName(nextBalance),
      },
    ],
    [currentBalance, impactClassName, impactDisplay, nextBalance],
  );

  const handleClose = () => {
    onClose();
  };

  const handleCopyQr = async (qrCodeUrl: string | null | undefined) => {
    const safeQrCodeUrl = qrCodeUrl?.trim();
    if (!safeQrCodeUrl || isSePayStaticQrLoading || isCopyingQr) {
      return;
    }

    setIsCopyingQr(true);
    try {
      await copyStudentWalletQrWithToast(safeQrCodeUrl, student);
    } catch {
      toast.error("Không thể sao chép QR. Vui lòng thử lại.");
    } finally {
      setIsCopyingQr(false);
    }
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (sePayTopupEnabled) {
      onClose();
      return;
    }

    if (!hasValidAmount) {
      toast.error(
        mode === "topup"
          ? "Vui lòng nhập số nguyên lớn hơn 0."
          : "Vui lòng nhập số nguyên lớn hơn 0.",
      );
      return;
    }

    if (!allowNegativeBalance && nextBalance < 0) {
      toast.error(blockedNegativeBalanceMessage);
      return;
    }

    if (directBalanceChangeSelected && !directBalanceChangeEnabled) {
      toast.error("Bạn không có quyền chỉnh thẳng số dư học sinh.");
      return;
    }

    if (directBalanceChangeSelected && directReasonRequired && !directReason) {
      toast.error("Vui lòng nhập lý do chỉnh số dư thủ công.");
      return;
    }

    if (mode === "topup" && topUpMethod === "sepay" && !sePayTopupEnabled) {
      toast.error("Thanh toán SePay chưa được bật trên giao diện này.");
      return;
    }

    onClose();
    runBackgroundSave({
      loadingMessage:
        directBalanceChangeLoadingMessage ??
        (mode === "withdraw"
          ? "Đang rút tiền..."
          : deltaAmount < 0
            ? "Đang cập nhật số dư..."
            : "Đang nạp tiền..."),
      successMessage:
        directBalanceChangeSuccessMessage ??
        (mode === "withdraw"
          ? `Đã rút ${formatCurrency(withdrawAmount)} khỏi ${successTargetLabel ?? `tài khoản của ${studentName}`}.`
          : deltaAmount < 0
            ? `Đã giảm ${formatCurrency(Math.abs(deltaAmount))} trên ${successTargetLabel ?? studentName}.`
            : `Đã nạp ${formatCurrency(deltaAmount)} cho ${successTargetLabel ?? studentName}.`),
      errorMessage:
        errorMessages?.[mode] ??
        (mode === "topup"
          ? "Không thể thay đổi số dư học sinh."
          : "Không thể rút tiền khỏi tài khoản học sinh."),
      action: () =>
        submitBalanceChange
          ? submitBalanceChange(deltaAmount, directReason || undefined)
          : studentApi.updateStudentAccountBalance({
              student_id: student.id,
              amount: deltaAmount,
              reason: directReason,
            }),
      onSuccess: async () => {
        await Promise.all(
          queryKeysToInvalidate.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
        await onSuccess?.();
      },
    });
  };

  if (!open) return null;

  const dialogEyebrow =
    sePayTopupEnabled && mode === "topup" ? "SePay" : modeCopy.eyebrow;
  const dialogTitle =
    sePayTopupEnabled && mode === "topup" ? "QR nạp ví SePay" : modeCopy.title;

  const primarySubmitLabel =
    sePayTopupEnabled ? "Đóng" : modeCopy.submitLabel;

  const showQrStep = sePayTopupEnabled;

  const qrImageSrc =
    sePayStaticQr?.qrCodeUrl?.trim() ||
    null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]" aria-hidden onClick={handleClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-balance-popup-title"
        className="fixed inset-x-3 bottom-3 top-20 z-50 flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden overscroll-contain rounded-[1.75rem] border border-border-default bg-bg-surface shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(34rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="border-b border-border-default bg-gradient-to-r from-bg-secondary via-bg-surface to-bg-secondary/70 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                {dialogEyebrow}
              </p>
              <h2 id="student-balance-popup-title" className="mt-1 text-lg font-semibold text-text-primary">
                {dialogTitle}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">{studentName}</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-border-default bg-bg-surface p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {showQrStep ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <section className="rounded-2xl border border-border-default bg-bg-secondary/50 p-4">
                <p className="text-sm font-semibold text-text-primary">QR nạp ví học sinh</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  Chuyển khoản với số tiền bất kỳ. Hệ thống sẽ cộng ví sau khi webhook SePay xác nhận giao dịch ngân hàng.
                </p>

                <ul className="mt-3 space-y-1 text-sm text-text-secondary">
                  {sePayStaticQr?.bankName ? (
                    <li>
                      <span className="text-text-muted">Ngân hàng:</span>{" "}
                      <span className="font-medium text-text-primary">{sePayStaticQr.bankName}</span>
                    </li>
                  ) : null}
                  {sePayStaticQr?.accountNumber ? (
                    <li>
                      <span className="text-text-muted">Số tài khoản:</span>{" "}
                      <span className="font-medium text-text-primary">{sePayStaticQr.accountNumber}</span>
                    </li>
                  ) : null}
                  {sePayStaticQr?.accountHolderName ? (
                    <li>
                      <span className="text-text-muted">Chủ tài khoản:</span>{" "}
                      <span className="font-medium text-text-primary">{sePayStaticQr.accountHolderName}</span>
                    </li>
                  ) : null}
                </ul>

                {isSePayStaticQrLoading ? (
                  <div className="mt-4 flex h-72 w-full items-center justify-center rounded-xl border border-border-default bg-bg-surface text-sm text-text-muted">
                    Đang tải QR SePay…
                  </div>
                ) : qrImageSrc ? (
                  <div className="mt-4 flex justify-center">
                    <Image
                      src={qrImageSrc}
                      alt="Mã QR thanh toán SePay"
                      width={288}
                      height={288}
                      unoptimized
                      className="max-h-72 w-72 max-w-full rounded-xl border border-border-default bg-bg-surface object-contain"
                    />
                  </div>
                ) : sePayStaticQrErrorMessage ? (
                  <p className="mt-4 rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                    {sePayStaticQrErrorMessage}
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-error">Không có ảnh QR SePay.</p>
                )}

                <button
                  type="button"
                  onClick={() => handleCopyQr(qrImageSrc)}
                  disabled={!qrImageSrc || isSePayStaticQrLoading || isCopyingQr}
                  aria-label="Sao chép mã QR chuyển khoản nạp ví"
                  className="mt-4 min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCopyingQr ? "Đang sao chép…" : "Sao chép QR"}
                </button>
              </section>
            </div>
            <div
              className={`grid shrink-0 gap-2 border-t border-border-default px-4 py-4 sm:px-5 ${
                showTopUpMethodTabs ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {showTopUpMethodTabs ? (
                <button
                  type="button"
                  onClick={() => {
                    setTopUpMethod("direct");
                  }}
                  className="min-h-11 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Nạp thẳng
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                className="min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid gap-4">
              <section className="rounded-2xl border border-border-default bg-bg-secondary/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${impactChip.chipClass}`}
                  >
                    {impactChip.chipLabel}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{modeCopy.description}</p>

                {mode === "topup" && showTopUpMethodTabs ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border-default bg-bg-surface p-1">
                    {([
                      ["sepay", "QR SePay"],
                      ["direct", "Nạp thẳng"],
                    ] as const).map(([method, label]) => {
                      const selected = topUpMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => {
                            setTopUpMethod(method);
                          }}
                          className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                            selected
                              ? "bg-primary text-text-inverse"
                              : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {summaryItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.1rem] border border-border-default bg-bg-surface px-3.5 py-3 shadow-sm"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        {item.label}
                      </p>
                      <p
                        className={`mt-2 text-sm font-semibold tabular-nums sm:text-base ${item.className}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {directBalanceChangeSelected ? (
                  <label className="mt-4 flex flex-col gap-1 text-sm text-text-secondary">
                    <span>Số tiền</span>
                    <MoneyInput
                      name="amount"
                      autoComplete="off"
                      value={amountInput}
                      onValueChange={setAmountInput}
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      placeholder="Ví dụ: 500.000…"
                    />
                  </label>
                ) : null}

                {directBalanceChangeSelected && directReasonRequired ? (
                  <label className="mt-4 flex flex-col gap-1 text-sm text-text-secondary">
                    <span>{directReasonLabel}</span>
                    <textarea
                      value={reasonInput}
                      onChange={(event) => setReasonInput(event.target.value)}
                      rows={3}
                      className="resize-none rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      placeholder={directReasonPlaceholder}
                    />
                  </label>
                ) : null}

                {mode === "topup" && topUpMethod === "sepay" ? (
                  <p
                    className="mt-2 rounded-xl border border-border-subtle bg-bg-surface/80 px-3 py-2 text-xs leading-relaxed text-text-secondary"
                  >
                    QR SePay không cố định số tiền. Webhook sẽ cộng đúng số tiền ngân hàng xác nhận.
                  </p>
                ) : null}

                {nextBalance < 0 && hasValidAmount && (mode === "withdraw" || deltaAmount < 0) ? (
                  <p className="mt-3 rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                    {allowNegativeBalance
                      ? `Sau giao dịch, tài khoản sẽ âm ${formatCurrency(Math.abs(nextBalance))}.`
                      : blockedNegativeBalanceMessage}
                  </p>
                ) : null}
              </section>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-11 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                {primarySubmitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
