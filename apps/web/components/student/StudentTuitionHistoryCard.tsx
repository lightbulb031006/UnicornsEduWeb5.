"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import type {
  StudentWalletTransaction,
  StudentWalletTransactionType,
} from "@/dtos/student.dto";
import { getMyStudentWalletHistory } from "@/lib/apis/auth.api";
import { formatCurrency } from "@/lib/class.helpers";
import { cn } from "@/lib/utils";
import { formatVnDateTime } from "@/lib/formatters";

const WALLET_HISTORY_LIMIT = 50;

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatVnDateTime(new Date(iso));
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

/**
 * Card lịch sử giao dịch ví của chính học sinh, render inline ở cuối trang
 * `/student/tuition` (thay cho popup lịch sử ở bản trước). Đọc
 * `GET /users/me/student-wallet-history`.
 */
export default function StudentTuitionHistoryCard() {
  const {
    data: transactions = [],
    isLoading,
    isError,
    error,
  } = useQuery<StudentWalletTransaction[]>({
    queryKey: ["student", "self", "wallet-history", WALLET_HISTORY_LIMIT],
    queryFn: () => getMyStudentWalletHistory({ limit: WALLET_HISTORY_LIMIT }),
    retry: false,
    staleTime: 30_000,
  });

  return (
    <section className="space-y-4 rounded-2xl border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-text-primary">
          Lịch sử giao dịch
        </h2>
        <p className="text-sm text-text-muted">
          {WALLET_HISTORY_LIMIT} giao dịch gần nhất trên ví học phí của bạn.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3">
          <p className="text-sm font-medium text-error">
            {(error as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Không thể tải lịch sử giao dịch."}
          </p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/30 p-8 text-center">
          <p className="text-sm font-semibold text-text-primary">
            Chưa có giao dịch nào
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
            Sau khi nạp học phí thành công, giao dịch sẽ hiển thị tại đây.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                      txChipClass(tx.type),
                    )}
                  >
                    {txLabel(tx.type)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDateTime(tx.date ?? tx.createdAt)}
                  </span>
                </div>
                {tx.note ? (
                  <p className="mt-1 text-sm text-text-secondary [overflow-wrap:anywhere]">
                    {tx.note}
                  </p>
                ) : null}
              </div>

              <span
                className={cn(
                  "shrink-0 text-base font-semibold tabular-nums sm:text-right",
                  tx.type === "topup" ? "text-primary" : "text-text-primary",
                )}
              >
                {tx.type === "topup" ? "+" : "-"}
                {formatCurrency(Math.abs(tx.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
