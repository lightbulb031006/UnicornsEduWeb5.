"use client";

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
        "rounded-2xl bg-panel-inverse p-5 text-panel-inverse-fg shadow-sm sm:p-6",
        className,
      )}
      aria-labelledby="student-tuition-balance-title"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            id="student-tuition-balance-title"
            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-panel-inverse-fg/70"
          >
            Số dư ví học phí
          </p>

          <p
            className={cn(
              "mt-2 text-3xl font-bold tabular-nums [overflow-wrap:anywhere] sm:text-4xl",
              isNegative && "text-warning",
            )}
          >
            {formatCurrency(balance)}
          </p>

          <p className="mt-2 text-xs text-panel-inverse-fg/70">
            {isNegative
              ? "Số dư đang âm — vui lòng nạp học phí để tiếp tục theo học."
              : studentName
                ? `Ví học phí của ${studentName}`
                : "Học phí mỗi buổi được trừ tự động sau khi điểm danh."}
          </p>
        </div>

        <button
          type="button"
          onClick={onTopUp}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 self-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primary-hover active:bg-primary-active focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel-inverse sm:w-auto"
        >
          <svg
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v14m7-7H5"
            />
          </svg>
          Nạp học phí
        </button>
      </div>
    </section>
  );
}
