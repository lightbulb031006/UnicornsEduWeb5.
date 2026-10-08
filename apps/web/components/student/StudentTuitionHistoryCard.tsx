"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  CircleMinus,
  History,
  Receipt,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type {
  StudentWalletTransaction,
  StudentWalletTransactionType,
} from "@/dtos/student.dto";
import { getMyStudentWalletHistory } from "@/lib/apis/auth.api";
import { formatCurrency } from "@/lib/class.helpers";
import { formatVnDayMonthTime } from "@/lib/formatters";
import {
  groupWalletTransactionsByMonth,
  isWalletCredit,
  walletTransactionDate,
} from "@/lib/student-wallet-history";
import { cn } from "@/lib/utils";

const WALLET_HISTORY_LIMIT = 50;

const TX_META: Record<
  StudentWalletTransactionType,
  { label: string; icon: LucideIcon; iconClassName: string }
> = {
  topup: {
    label: "Nạp tiền",
    icon: ArrowDownLeft,
    iconClassName: "bg-primary/10 text-primary",
  },
  extend: {
    label: "Trừ học phí",
    icon: Receipt,
    iconClassName: "bg-info/10 text-info",
  },
  repayment: {
    label: "Thu lại học phí",
    icon: RotateCcw,
    iconClassName: "bg-error/10 text-error",
  },
  loan: {
    label: "Giảm số dư",
    icon: CircleMinus,
    iconClassName: "bg-warning/15 text-text-primary",
  },
};

function TransactionRow({ tx }: { tx: StudentWalletTransaction }) {
  const meta = TX_META[tx.type] ?? TX_META.extend;
  const Icon = meta.icon;
  const credit = isWalletCredit(tx);
  const date = walletTransactionDate(tx);

  return (
    <li className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          meta.iconClassName,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{meta.label}</p>
        <p className="text-xs tabular-nums text-text-muted">
          {formatVnDayMonthTime(date) || "—"}
        </p>
        {tx.note ? (
          <p className="mt-1 text-xs text-text-secondary [overflow-wrap:anywhere]">
            {tx.note}
          </p>
        ) : null}
      </div>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums sm:text-base",
          credit ? "text-success" : "text-text-primary",
        )}
      >
        {credit ? "+" : "−"}
        {formatCurrency(Math.abs(tx.amount))}
      </span>
    </li>
  );
}

/**
 * Card lịch sử giao dịch ví của chính học sinh, render inline cuối trang
 * `/student/tuition`, gom theo tháng (giờ Việt Nam). Đọc
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

  const groups = useMemo(
    () => groupWalletTransactionsByMonth(transactions),
    [transactions],
  );

  return (
    <section
      aria-labelledby="student-tuition-history-title"
      className="space-y-4 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-secondary text-text-secondary">
          <History className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2
            id="student-tuition-history-title"
            className="text-base font-bold text-text-primary sm:text-lg"
          >
            Lịch sử giao dịch
          </h2>
          <p className="text-sm text-text-muted">
            {WALLET_HISTORY_LIMIT} giao dịch gần nhất trên ví học phí.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-2" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3">
          <p className="text-sm font-medium text-error">
            {(error as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Không thể tải lịch sử giao dịch."}
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/30 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-text-primary">
            Chưa có giao dịch nào
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
            Sau khi nạp học phí thành công, giao dịch sẽ hiển thị tại đây.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {group.label}
              </h3>
              <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-default bg-bg-secondary/20">
                {group.transactions.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
