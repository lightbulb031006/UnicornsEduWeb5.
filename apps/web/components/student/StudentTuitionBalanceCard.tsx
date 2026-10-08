"use client";

import { Plus, Wallet } from "lucide-react";

import { formatCurrency } from "@/lib/class.helpers";
import { cn } from "@/lib/utils";

type Props = {
  balance: number;
  studentName?: string | null;
  onTopUp: () => void;
  className?: string;
};

/**
 * Thẻ số dư ví học phí ở đầu trang `/student/tuition`. Tách riêng khỏi
 * `StudentWalletCard` (dùng cho màn admin) để trang học sinh có bố cục
 * hero-style: nền tối `panel-inverse` (cố định tối ở mọi theme), số dư nổi bật,
 * CTA nạp học phí dùng đúng token primary button của design system
 * (`primary` / `text-inverse`, hover `primary-hover`, active `primary-active`).
 */
export default function StudentTuitionBalanceCard({
  balance,
  studentName,
  onTopUp,
  className,
}: Props) {
  const isNegative = balance < 0;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl bg-panel-inverse p-5 text-panel-inverse-fg shadow-sm sm:p-6",
        className,
      )}
      aria-labelledby="student-tuition-balance-title"
    >
      {/* Vệt sáng trang trí góc phải, không nhận click. */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/25 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-panel-inverse-fg/10">
              <Wallet className="size-4" aria-hidden />
            </span>
            <p
              id="student-tuition-balance-title"
              className="text-[11px] font-semibold uppercase tracking-[0.24em] text-panel-inverse-fg/70"
            >
              Số dư ví học phí
            </p>
          </div>

          <p
            className={cn(
              "mt-3 text-3xl font-bold tabular-nums [overflow-wrap:anywhere] sm:text-4xl",
              isNegative && "text-warning",
            )}
          >
            {formatCurrency(balance)}
          </p>

          {studentName ? (
            <p className="mt-1 text-sm text-panel-inverse-fg/80">
              Ví học phí của {studentName}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onTopUp}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primary-hover active:translate-y-0 active:bg-primary-active focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel-inverse motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-auto"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Nạp học phí
        </button>
      </div>

      <p
        className={cn(
          "relative mt-5 border-t border-panel-inverse-fg/10 pt-4 text-xs",
          isNegative ? "text-warning" : "text-panel-inverse-fg/70",
        )}
      >
        {isNegative
          ? "Số dư đang âm — vui lòng nạp học phí để tiếp tục theo học."
          : "Học phí mỗi buổi được trừ tự động từ ví sau khi điểm danh."}
      </p>
    </section>
  );
}
