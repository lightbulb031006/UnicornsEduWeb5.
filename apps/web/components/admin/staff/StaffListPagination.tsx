"use client";

const PAGER_BUTTON_CLASS =
  "min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50 sm:py-2";

/**
 * Phân trang «Hiển thị a-b trong N nhân sự · Trước / Sau» của danh sách nhân
 * sự (`/admin/staffs`, `/staff/staffs`). Ẩn khi chỉ có 1 trang.
 */
export default function StaffListPagination({
  page,
  pageSize,
  total,
  onPrevious,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav
      className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      aria-label="Phân trang"
    >
      <p className="text-sm text-text-muted" aria-live="polite">
        Hiển thị {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}{" "}
        trong {total} nhân sự
      </p>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:items-center">
        <button
          type="button"
          className={PAGER_BUTTON_CLASS}
          disabled={page <= 1}
          aria-label="Trang trước"
          onClick={onPrevious}
        >
          Trước
        </button>
        <span className="text-center text-sm tabular-nums text-text-secondary">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          className={PAGER_BUTTON_CLASS}
          disabled={page >= totalPages}
          aria-label="Trang sau"
          onClick={onNext}
        >
          Sau
        </button>
      </div>
    </nav>
  );
}
