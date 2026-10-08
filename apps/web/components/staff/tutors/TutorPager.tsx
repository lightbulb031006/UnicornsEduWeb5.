import { ChevronLeft, ChevronRight } from "lucide-react";
import { countPages } from "@/lib/training-tutor";

/** Phân trang trước/sau; ẩn khi chỉ có 1 trang. */
export default function TutorPager({
  page,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = countPages(total, limit);
  if (pageCount <= 1) return null;

  const buttonClass =
    "inline-flex size-10 items-center justify-center rounded-md border border-border-default text-text-primary hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

  return (
    <nav
      className="flex items-center justify-center gap-3 pt-2"
      aria-label="Phân trang"
    >
      <button
        type="button"
        className={buttonClass}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="text-sm text-text-muted">
        {page}/{pageCount}
      </span>
      <button
        type="button"
        className={buttonClass}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}
