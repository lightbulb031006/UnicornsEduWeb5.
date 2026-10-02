"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";
import type { StudentWalletTransaction, StudentWalletTransactionType } from "@/dtos/student.dto";
import * as studentApi from "@/lib/apis/student.api";
import { formatCurrency } from "@/lib/class.helpers";
import {
  formatVnDate,
  formatVnDateTime,
} from "@/lib/formatters";

const WALLET_HISTORY_LIMIT = 50;

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName?: string;
  currentBalance?: number;
  queryKeyBase?: QueryKey;
  loadTransactions?: (params: { studentId: string; limit: number }) => Promise<StudentWalletTransaction[]>;
  eyebrowLabel?: string;
  emptyDescription?: string;
  errorDescription?: string;
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatVnDateTime(new Date(iso));
  } catch {
    return "—";
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatVnDate(new Date(iso));
  } catch {
    return "—";
  }
}

function txLabel(type: StudentWalletTransactionType): string {
  switch (type) {
    case "topup":
      return "Nạp tiền";
    case "loan":
      return "Giảm số dư";
    case "repayment":
      return "Thu lại học phí";
    case "extend":
      return "Trừ học phí";
    default:
      return "Giao dịch";
  }
}

function txChipClass(type: StudentWalletTransactionType): string {
  switch (type) {
    case "topup":
      return "bg-primary/10 text-primary ring-primary/20";
    case "loan":
      return "bg-warning/15 text-text-primary ring-warning/25";
    case "repayment":
      return "bg-error/10 text-error ring-error/20";
    case "extend":
      return "bg-info/10 text-info ring-info/20";
    default:
      return "bg-bg-tertiary text-text-primary ring-border-default";
  }
}

function txAmountPrefix(type: StudentWalletTransactionType): string {
  return type === "topup" ? "+" : "-";
}

function txAmountClass(type: StudentWalletTransactionType): string {
  return type === "topup" ? "text-primary" : "text-text-primary";
}

function getErrorMessage(error: unknown): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (error as Error)?.message ??
    "Không thể tải lịch sử giao dịch."
  );
}

export default function StudentWalletHistoryPopup({
  open,
  onClose,
  studentId,
  studentName,
  currentBalance = 0,
  queryKeyBase = ["student", "wallet-history"],
  loadTransactions,
  eyebrowLabel = "Wallet Ledger",
  emptyDescription = "Popup này đang đọc trực tiếp từ lịch sử ví authoritative của hệ thống.",
  errorDescription = "Hệ thống chưa đọc được dữ liệu từ lịch sử ví của học sinh này.",
}: Props) {
  const title = studentName?.trim() || "Học sinh";
  const resolvedQueryKey = [...queryKeyBase, studentId, WALLET_HISTORY_LIMIT];
  const {
    data: txs = [],
    isLoading,
    isError,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: resolvedQueryKey,
    queryFn: () =>
      loadTransactions
        ? loadTransactions({
            studentId,
            limit: WALLET_HISTORY_LIMIT,
          })
        : studentApi.getStudentWalletHistory(studentId, {
            limit: WALLET_HISTORY_LIMIT,
          }),
    enabled: open && !!studentId,
    staleTime: 30_000,
  });

  const latestTransaction = txs[0] ?? null;

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 p-2 sm:p-4">
        <div className="mx-auto flex h-full w-full items-center max-w-3xl">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-wallet-history-title"
            className="flex max-h-full w-full flex-col overflow-hidden overscroll-contain rounded-[1.5rem] border border-border-default bg-bg-surface shadow-2xl sm:rounded-[1.75rem]"
          >
            <div className="border-b border-border-default bg-[linear-gradient(135deg,var(--ue-bg-secondary),var(--ue-bg-surface)_46%,color-mix(in_oklab,var(--ue-primary)_10%,transparent))] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                      {eyebrowLabel}
                    </p>
                    {isFetching && !isLoading ? (
                      <span className="inline-flex rounded-full bg-bg-surface/80 px-2 py-0.5 text-[11px] font-medium text-text-muted ring-1 ring-border-default">
                        Đang làm mới
                      </span>
                    ) : null}
                  </div>
                  <h2 id="student-wallet-history-title" className="mt-1 text-balance text-lg font-semibold text-text-primary">
                    Lịch sử giao dịch
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">{title}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Đóng"
                >
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-[1.15rem] border border-border-default bg-bg-surface/90 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Số dư hiện tại
                  </p>
                  <p className={`mt-2 text-sm font-semibold tabular-nums sm:text-base ${currentBalance < 0 ? "text-error" : "text-text-primary"}`}>
                    {formatCurrency(currentBalance)}
                  </p>
                </div>
                <div className="rounded-[1.15rem] border border-border-default bg-bg-surface/90 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Bản ghi đang xem
                  </p>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-text-primary sm:text-base">
                    {isLoading ? "—" : txs.length}
                  </p>
                </div>
                <div className="rounded-[1.15rem] border border-border-default bg-bg-surface/90 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Giao dịch gần nhất
                  </p>
                  <p className="mt-2 text-sm font-semibold text-text-primary sm:text-base">
                    {isLoading ? "—" : formatDateTime(latestTransaction?.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {isLoading ? (
                <div className="space-y-3" aria-busy="true">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[1.15rem] border border-border-default bg-bg-secondary/40 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="h-6 w-28 animate-pulse rounded-full bg-bg-tertiary" />
                        <div className="h-4 w-32 animate-pulse rounded bg-bg-tertiary" />
                      </div>
                      <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-bg-tertiary" />
                      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-bg-tertiary" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="rounded-[1.15rem] border border-error/30 bg-error/10 px-4 py-5">
                  <p className="text-sm font-medium text-error">{getErrorMessage(error)}</p>
                  <p className="mt-1 text-sm text-text-secondary">{errorDescription}</p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    Thử lại
                  </button>
                </div>
              ) : txs.length === 0 ? (
                <div className="rounded-[1.15rem] border border-border-default bg-bg-secondary/40 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-text-primary">Chưa có giao dịch nào được ghi nhận.</p>
                  <p className="mt-1 text-sm text-text-muted">{emptyDescription}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {txs.map((tx) => (
                    <div
                      key={tx.id}
                      className="rounded-[1.15rem] border border-border-default bg-[linear-gradient(180deg,var(--ue-bg-surface),color-mix(in_oklab,var(--ue-bg-secondary)_55%,transparent))] px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${txChipClass(tx.type)}`}>
                              {txLabel(tx.type)}
                            </span>
                            <span className="text-xs text-text-muted">
                              Ghi nhận lúc {formatDateTime(tx.createdAt)}
                            </span>
                          </div>

                          {tx.note?.trim() ? (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                              {tx.note.trim()}
                            </p>
                          ) : (
                            <p className="mt-3 text-sm text-text-muted">Không có ghi chú đi kèm.</p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-xs text-text-muted">
                              Ngày giao dịch {formatDate(tx.date ?? tx.createdAt)}
                            </span>
                            <span className="inline-flex rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-xs text-text-muted">
                              Mã {tx.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 rounded-2xl border border-border-default bg-bg-surface px-4 py-3 text-left shadow-sm sm:min-w-36 sm:text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            Biến động
                          </p>
                          <p className={`mt-2 text-sm font-semibold tabular-nums sm:text-base ${txAmountClass(tx.type)}`}>
                            {txAmountPrefix(tx.type)}
                            {formatCurrency(tx.amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-border-default px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
